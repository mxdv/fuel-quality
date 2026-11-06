'use strict';
/**
 * Live: DID 5776 FAK_KRAFTSTOFFQUALITAET_ADAPT — raw/256 → factor → RON 98..91
 * Fills: DID 4035 KQE — 5×(km×8 + QB 1..3)
 */

const FAC_FQ_SCALE = 1 / 256;
const ROZ_HIGH = 98;
const ROZ_LOW = 91;
const DID_FAC = 0x5776;
const DID_KQE = 0x4035;
const KQE_LAYOUT_BYTES = 21;
const KQE_KM_MUL = 8;

const FILL_LABELS = { 1: 'Low', 2: 'Mid', 3: 'High' };

function factorToRoz(factor) {
    const clamped = Math.min(Math.max(factor, 0), 1);
    return ROZ_HIGH - (ROZ_HIGH - ROZ_LOW) * clamped;
}

function decodeFacFq(raw) {
    if (!raw || !raw.length) throw new Error('empty payload');
    let rawInt;
    let factor;

    if (raw.length === 1) {
        rawInt = raw[0];
        factor = rawInt * FAC_FQ_SCALE;
    } else if (raw.length === 2) {
        if (raw[0] === 0x00) {
            rawInt = raw[1];
            factor = rawInt * FAC_FQ_SCALE;
        } else if (raw[1] === 0x00) {
            rawInt = raw[0];
            factor = rawInt * FAC_FQ_SCALE;
        } else {
            const be = (raw[0] << 8) | raw[1];
            rawInt = be;
            factor = be * FAC_FQ_SCALE;
            if (factor > 1.05) factor = be / 32768;
        }
    } else {
        rawInt = raw[0];
        factor = rawInt * FAC_FQ_SCALE;
    }

    return {
        factor: factor,
        roz: factorToRoz(factor),
        rawInt: rawInt,
    };
}

function u16be(raw, off) {
    return ((raw[off] << 8) | raw[off + 1]) >>> 0;
}

/** Last 5 fill grades from KQE DID 4035. index 0 = newest. */
function decodeFillGrades(raw) {
    const empty = { decodeOk: false, fills: [] };
    if (!raw || !raw.length) return empty;

    if (raw.length >= KQE_LAYOUT_BYTES) {
        const fills = [];
        let off = 6;
        let ok = true;
        for (let i = 0; i < 5; i++) {
            const kmRaw = u16be(raw, off);
            off += 2;
            const qb = raw[off];
            off += 1;
            if (qb !== 0 && qb !== 1 && qb !== 2 && qb !== 3) {
                ok = false;
                break;
            }
            const grade = qb || null;
            fills.push({
                index: i,
                grade: grade,
                label: grade ? FILL_LABELS[grade] : '--',
                km: kmRaw * KQE_KM_MUL,
            });
        }
        if (ok && fills.some((f) => f.grade != null)) {
            return { decodeOk: true, fills: fills };
        }
    }

    if (raw.length === 5 && raw.every((b) => b <= 3)) {
        return {
            decodeOk: true,
            fills: raw.map((b, i) => ({
                index: i,
                grade: b || null,
                label: b ? FILL_LABELS[b] : '--',
                km: null,
            })),
        };
    }

    return empty;
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
    return null;
}

module.exports = {
    FAC_FQ_SCALE: FAC_FQ_SCALE,
    ROZ_HIGH: ROZ_HIGH,
    ROZ_LOW: ROZ_LOW,
    DID_FAC: DID_FAC,
    DID_KQE: DID_KQE,
    FILL_LABELS: FILL_LABELS,
    decodeFacFq: decodeFacFq,
    decodeFillGrades: decodeFillGrades,
    factorToRoz: factorToRoz,
    payloadFromUds: payloadFromUds,
};
