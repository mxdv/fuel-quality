'use strict';
/**
 * Fuel Quality — large ROZ / adaptation readout from DME DID 5776 via InternalTasu.
 *
 * Drop into idrive7-apps as apps/fuel_quality (requires that repo's kit/ + renderer).
 * Live Data already shows the same DID as a small row; this app is the dedicated view.
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const { hex } = require('./kit/diag');
const DEC = require('./decode');

const W = 1600;
const H = 520;
const GO = '#2fd27a';
const ACCENT = '#7ec8ff';

function parseHex(s, fallback) {
    const n = parseInt(String(s), 16);
    return Number.isFinite(n) ? n : fallback;
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log, signals } = ctx;
        const link = new ReadOnlyDiag(signals, log);
        await link.init();

        let last = null;          // decoded sample or error
        let status = 'init';      // init | live | demo | error | silent
        let lastAt = 0;
        let busy = false;

        const demoOn = () => {
            const m = settings.get('demo');
            if (m === 'on') return true;
            if (m === 'off') return false;
            return !link.available;
        };

        function demoSample() {
            const factor = 0.18;
            return {
                factor: factor,
                roz: DEC.factorToRoz(factor),
                rawInt: Math.round(factor * 256),
                path: 'demo',
                label: DEC.decodeFacFq([Math.round(factor * 256)]).label,
            };
        }

        async function poll() {
            if (busy) return;
            busy = true;
            try {
                if (demoOn()) {
                    last = demoSample();
                    status = 'demo';
                    lastAt = Date.now();
                    return;
                }
                const ecu = parseHex(settings.get('ecu'), 0x12);
                const did = parseHex(settings.get('did'), 0x5776);
                const uds = await link.read(ecu, did, 2000);
                if (uds === undefined) return; // cancelled
                if (!uds) {
                    status = link.silent(ecu) ? 'silent' : 'error';
                    last = { error: 'нет ответа DME 0x' + hex(ecu) };
                    return;
                }
                if (uds[0] === 0x7F) {
                    status = 'error';
                    last = { error: 'NRC 0x' + hex(uds[2] || 0) + ' на DID ' + hex(did, 4) };
                    return;
                }
                const payload = DEC.payloadFromUds(uds, did);
                if (!payload || !payload.length) {
                    status = 'error';
                    last = { error: 'пустой payload: ' + uds.map((b) => hex(b)).join(' ') };
                    return;
                }
                if (did === 0x407F) {
                    // SUPERKLOPFER history block — show raw length until a dedicated decoder lands
                    last = {
                        factor: null,
                        roz: null,
                        rawInt: payload[0],
                        path: 'SUPERKLOPFER raw ' + payload.length + ' B',
                        label: payload.slice(0, 12).map((b) => hex(b)).join(' '),
                    };
                } else {
                    last = DEC.decodeFacFq(payload);
                }
                status = 'live';
                lastAt = Date.now();
            } catch (e) {
                status = 'error';
                last = { error: String(e && e.message || e) };
                log.warn('fuel_quality poll: ' + (e && e.stack || e));
            } finally {
                busy = false;
            }
        }

        ui.onClick('BTN_REFRESH', () => { link.wake(); poll(); });

        function age() {
            if (!lastAt) return '';
            const s = Math.max(0, Math.round((Date.now() - lastAt) / 1000));
            return s < 60 ? s + ' с назад' : Math.floor(s / 60) + ' мин назад';
        }

        function barColor(factor) {
            if (!G.isNum(factor)) return ACCENT;
            if (factor <= 0.2) return GO;
            if (factor <= 0.55) return ACCENT;
            if (factor <= 0.8) return '#e6b84a';
            return '#e85d5d';
        }

        function render() {
            const t = ctx.theme();
            const cv = ctx.canvas(W, H).clear(t.bg);
            const s = last || {};
            const live = status === 'live' || status === 'demo';

            cv.text('КАЧЕСТВО ТОПЛИВА', 48, 48, 22, t.dim, { font: 'bold', spacing: 1.5 });
            cv.text(
                status === 'demo' ? 'DEMO' : status === 'live' ? 'LIVE · DME' : status.toUpperCase(),
                1552, 48, 22, status === 'live' ? GO : t.dim, { align: 'right', font: 'bold', spacing: 1 }
            );

            const roz = G.isNum(s.roz) ? s.roz.toFixed(1) : '--';
            cv.text(roz, 48, 200, 140, live ? t.text : t.dim, { font: 'num' });
            cv.text('ROZ ≈', 48, 100, 28, t.dim, { font: 'bold', spacing: 1 });
            cv.text('оценка по адаптации DME, не лабораторное октановое число', 48, 280, 22, t.dim);

            // factor strip
            const fx = G.isNum(s.factor) ? s.factor : null;
            const bx = 48, by = 340, bw = 900, bh = 36;
            cv.fillRect(bx, by, bw, bh, withAlpha(t.text, 0.08));
            if (G.isNum(fx)) {
                const w = Math.round(bw * G.clamp(fx, 0, 1));
                cv.fillRect(bx, by, Math.max(w, 2), bh, barColor(fx));
            }
            cv.text('0 · ROZ98', bx, by + bh + 28, 20, t.dim);
            cv.text('1 · ROZ91', bx + bw, by + bh + 28, 20, t.dim, { align: 'right' });

            // side panel
            const px = 1040;
            const rows = [
                ['фактор', G.isNum(s.factor) ? s.factor.toFixed(3) : '--'],
                ['raw', s.rawInt != null ? String(s.rawInt) : '--'],
                ['декод', s.path || '--'],
                ['DID', String(settings.get('did') || '5776')],
                ['опрос', age() || '—'],
            ];
            rows.forEach((row, i) => {
                const y = 100 + i * 52;
                cv.text(row[0], px, y, 20, t.dim, { font: 'bold', spacing: 1 });
                cv.text(row[1], 1552, y, 28, t.text, { align: 'right', font: 'num' });
            });

            const note = s.error || s.label || '';
            if (note) {
                cv.text(note, 48, 460, 24, s.error ? '#e85d5d' : t.text);
            }

            ctx.ui.image('MAIN_GFX', cv);
        }

        ctx.loop('MAIN', 4, async () => {
            const interval = parseInt(settings.get('pollMs'), 10) || 1500;
            if (!lastAt || Date.now() - lastAt >= interval) await poll();
            render();
        });

        await poll();
    },
});
