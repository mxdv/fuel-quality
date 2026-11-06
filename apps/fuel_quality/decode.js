'use strict';
/**
 * Same scaling as bmw_fq/decode.py / dme8ff_r.prg:
 *   DID 5776 FAK_KRAFTSTOFFQUALITAET_ADAPT
 *   raw / 256 → factor 0..~1
 *   0 ≈ ROZ98, 1 ≈ ROZ91
 */

const FAC_FQ_SCALE = 1 / 256;
const ROZ_HIGH = 98;
const ROZ_LOW = 91;

function label(factor) {
    if (factor <= 0.08) return 'отличное (адаптация почти не активна)';
    if (factor <= 0.30) return 'хорошее';
    if (factor <= 0.55) return 'среднее';
    if (factor <= 0.80) return 'пониженное';
    return 'низкое (DME сильно корректирует под детонацию)';
}

function factorToRoz(factor) {
    const clamped = Math.min(Math.max(factor, 0), 1);
    return ROZ_HIGH - (ROZ_HIGH - ROZ_LOW) * clamped;
}

function decodeFacFq(raw) {
    if (!raw || !raw.length) throw new Error('empty payload');
    let rawInt;
    let factor;
    let path;

    if (raw.length === 1) {
        rawInt = raw[0];
        factor = rawInt * FAC_FQ_SCALE;
        path = 'uint8 / 256';
    } else if (raw.length === 2) {
        if (raw[0] === 0x00) {
            rawInt = raw[1];
            factor = rawInt * FAC_FQ_SCALE;
            path = 'uint16-BE low-byte / 256';
        } else if (raw[1] === 0x00) {
            rawInt = raw[0];
            factor = rawInt * FAC_FQ_SCALE;
            path = 'uint16-LE low-byte / 256';
        } else {
            const be = (raw[0] << 8) | raw[1];
            rawInt = be;
            factor = be * FAC_FQ_SCALE;
            path = 'uint16-BE / 256';
            if (factor > 1.05) {
                factor = be / 32768;
                path = 'uint16-BE / 32768';
            }
        }
    } else {
        rawInt = raw[0];
        factor = rawInt * FAC_FQ_SCALE;
        path = 'first-byte / 256 (len ' + raw.length + ')';
    }

    return {
        factor: factor,
        roz: factorToRoz(factor),
        rawInt: rawInt,
        path: path,
        label: label(factor),
    };
}

/** Positive UDS 62 reply → payload after DID, or null. */
function payloadFromUds(uds, did) {
    if (!uds || !uds.length || uds[0] !== 0x62) return null;
    const hi = (did >> 8) & 0xff;
    const lo = did & 0xff;
    for (let i = 1; i + 1 < uds.length; i++) {
        if (uds[i] === hi && uds[i + 1] === lo) {
            return uds.slice(i + 2);
        }
    }
    if (uds.length >= 3 && uds[1] === hi && uds[2] === lo) return uds.slice(3);
    return null;
}

module.exports = {
    FAC_FQ_SCALE: FAC_FQ_SCALE,
    ROZ_HIGH: ROZ_HIGH,
    ROZ_LOW: ROZ_LOW,
    decodeFacFq: decodeFacFq,
    factorToRoz: factorToRoz,
    payloadFromUds: payloadFromUds,
};
