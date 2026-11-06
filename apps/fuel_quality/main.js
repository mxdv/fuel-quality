'use strict';
/**
 * Fuel Quality — RON estimate (DID 5776) + last 5 fill grades (DID 4035).
 */
const mgu = require('./kit/mgu');
const G = require('./kit/gauges');
const { withAlpha } = require('./kit/canvas');
const { ReadOnlyDiag } = require('./kit/readonly-diag');
const DEC = require('./decode');

const W = 1600;
const H = 520;
const GO = '#2fd27a';
const MID = '#e6b84a';
const LOW = '#e85d5d';
const ACCENT = '#7ec8ff';

function parseHex(s, fallback) {
    const n = parseInt(String(s), 16);
    return Number.isFinite(n) ? n : fallback;
}

function gradeColor(grade) {
    if (grade === 3) return GO;
    if (grade === 2) return MID;
    if (grade === 1) return LOW;
    return ACCENT;
}

mgu.run({
    async start(ctx) {
        const { ui, settings, log, signals } = ctx;
        const link = new ReadOnlyDiag(signals, log);
        await link.init();

        let live = null;
        let fills = [];
        let status = 'init';
        let lastAt = 0;
        let fillsAt = 0;
        let busy = false;

        const demoOn = () => {
            const m = settings.get('demo');
            if (m === 'on') return true;
            if (m === 'off') return false;
            return !link.available;
        };

        function demoData() {
            live = { factor: 0.18, roz: DEC.factorToRoz(0.18), rawInt: 46 };
            fills = [
                { index: 0, grade: 3, label: 'High', km: 48200 },
                { index: 1, grade: 3, label: 'High', km: 47640 },
                { index: 2, grade: 2, label: 'Mid', km: 47010 },
                { index: 3, grade: 2, label: 'Mid', km: 46380 },
                { index: 4, grade: 1, label: 'Low', km: 45720 },
            ];
            status = 'demo';
            lastAt = fillsAt = Date.now();
        }

        async function readDid(ecu, did) {
            const uds = await link.read(ecu, did, 2000);
            if (uds === undefined) return undefined;
            if (!uds || uds[0] === 0x7F) return null;
            return DEC.payloadFromUds(uds, did);
        }

        async function poll() {
            if (busy) return;
            busy = true;
            try {
                if (demoOn()) {
                    demoData();
                    return;
                }
                const ecu = parseHex(settings.get('ecu'), 0x12);

                const facRaw = await readDid(ecu, DEC.DID_FAC);
                if (facRaw === undefined) return;
                if (!facRaw || !facRaw.length) {
                    status = link.silent(ecu) ? 'silent' : 'error';
                    return;
                }
                live = DEC.decodeFacFq(facRaw);
                status = 'live';
                lastAt = Date.now();

                const needFills = !fillsAt || Date.now() - fillsAt > 15000;
                if (needFills) {
                    const kqe = await readDid(ecu, DEC.DID_KQE);
                    if (kqe && kqe.length) {
                        const decoded = DEC.decodeFillGrades(kqe);
                        if (decoded.decodeOk) fills = decoded.fills;
                        fillsAt = Date.now();
                    }
                }
            } catch (e) {
                status = 'error';
                log.warn('fuel_quality: ' + (e && e.message || e));
            } finally {
                busy = false;
            }
        }

        ui.onClick('BTN_REFRESH', () => {
            link.wake();
            fillsAt = 0;
            poll();
        });

        function render() {
            const t = ctx.theme();
            const cv = ctx.canvas(W, H).clear(t.bg);
            const ok = status === 'live' || status === 'demo';

            // Label baseline well above the big numeral (glyphs rise ~0.75× size from baseline).
            cv.text('RON', 48, 44, 22, t.dim, { font: 'bold', spacing: 2 });
            const ron = live && G.isNum(live.roz) ? live.roz.toFixed(1) : '--';
            cv.text(ron, 48, 200, 120, ok ? t.text : t.dim, { font: 'num' });

            cv.text('RAW', 520, 44, 22, t.dim, { font: 'bold', spacing: 2 });
            const raw = live && live.rawInt != null ? String(live.rawInt) : '--';
            cv.text(raw, 520, 200, 120, ok ? t.text : t.dim, { font: 'num' });

            cv.text('LAST 5 FILLS', 48, 280, 22, t.dim, { font: 'bold', spacing: 2 });

            const list = fills.length ? fills : [0, 1, 2, 3, 4].map((i) => ({ index: i, grade: null, label: '--', km: null }));
            const slotW = 280;
            const gap = 24;
            const x0 = 48;
            const y0 = 320;
            list.slice(0, 5).forEach((f, i) => {
                const x = x0 + i * (slotW + gap);
                const col = gradeColor(f.grade);
                cv.fillRect(x, y0, slotW, 120, withAlpha(col, 0.12));
                cv.fillRect(x, y0, 8, 120, col);
                cv.text('#' + (i + 1), x + 28, y0 + 36, 22, t.dim, { font: 'bold' });
                cv.text(f.label || '--', x + 28, y0 + 78, 40, f.grade ? t.text : t.dim, { font: 'num' });
                if (f.km != null) {
                    cv.text(String(f.km) + ' km', x + slotW - 20, y0 + 78, 22, t.dim, { align: 'right' });
                }
            });

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
