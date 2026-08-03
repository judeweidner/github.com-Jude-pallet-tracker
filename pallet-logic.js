function getPalletId(pallet) {
  if (!pallet || typeof pallet !== 'object') return null;
  return (
    pallet.id ||
    pallet.palletId ||
    pallet.Pallet ||
    pallet['Pallet Number'] ||
    pallet['Pallet ID'] ||
    null
  );
}

function normalizeHoldValue(value) {
  if (value === true || value === false) return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 'on';
  }
  return false;
}

function getXlsx() {
  if (typeof XLSX !== 'undefined' && XLSX && XLSX.utils) return XLSX;
  if (typeof require === 'function') {
    try {
      return require('xlsx');
    } catch (_err) {
      return null;
    }
  }
  return null;
}

function parseWorkbookRows(fileData) {
  if (Array.isArray(fileData)) {
    return fileData;
  }

  if (!fileData || typeof fileData !== 'object') {
    return [];
  }

  const xlsx = getXlsx();

  if (fileData.SheetNames && fileData.Sheets) {
    const sheetName = fileData.SheetNames[0];
    const sheet = fileData.Sheets[sheetName];
    if (sheet && xlsx) {
      return xlsx.utils.sheet_to_json(sheet, { defval: null });
    }
  }

  if (xlsx) {
    let workbook = null;

    try {
      if (fileData instanceof ArrayBuffer || ArrayBuffer.isView(fileData)) {
        workbook = xlsx.read(fileData, { type: 'array' });
      } else if (typeof fileData === 'string') {
        workbook = xlsx.read(fileData, { type: 'binary' });
      }
    } catch (_err) {
      workbook = null;
    }

    if (workbook && workbook.SheetNames && workbook.Sheets) {
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      if (sheet) {
        return xlsx.utils.sheet_to_json(sheet, { defval: null });
      }
    }
  }

  return [];
}

function normalizePalletForCompare(pallet) {
  return {
    id: getPalletId(pallet),
    status: pallet.status || pallet.Status || null,
    hold: normalizeHoldValue(pallet.hold ?? pallet.Hold),
    eta: pallet.eta || pallet.ETA || null,
    notes: pallet.notes || pallet.Notes || null,
  };
}

function palletEqual(a, b) {
  const normalizedA = normalizePalletForCompare(a);
  const normalizedB = normalizePalletForCompare(b);
  return (
    normalizedA.id === normalizedB.id &&
    normalizedA.status === normalizedB.status &&
    normalizedA.hold === normalizedB.hold &&
    normalizedA.eta === normalizedB.eta &&
    normalizedA.notes === normalizedB.notes
  );
}

window.PalletLogic = {
  parseWorkbook(fileData) {
    const rows = parseWorkbookRows(fileData);
    const pallets = rows.map((row, index) => ({
      id: getPalletId(row) || `row-${index}`,
      status: row.status ?? row.Status ?? null,
      hold: normalizeHoldValue(row.hold ?? row.Hold),
      eta: row.eta ?? row.ETA ?? null,
      notes: row.notes ?? row.Notes ?? null,
      raw: row,
    }));

    return { pallets, changes: [] };
  },

  mergeImport(existing, incoming) {
    const existingMap = new Map();
    const merged = [];
    const changes = [];
    const seen = new Set();

    (existing || []).forEach((pallet) => {
      const id = getPalletId(pallet);
      if (id) existingMap.set(id, pallet);
    });

    (incoming || []).forEach((incomingPallet) => {
      const id = getPalletId(incomingPallet);
      if (!id) {
        return;
      }

      const existingPallet = existingMap.get(id);
      if (!existingPallet) {
        merged.push(incomingPallet);
        changes.push({ type: 'added', pallet: incomingPallet });
      } else if (!palletEqual(existingPallet, incomingPallet)) {
        const mergedPallet = { ...existingPallet, ...incomingPallet };
        merged.push(mergedPallet);
        changes.push({ type: 'updated', before: existingPallet, after: mergedPallet });
      } else {
        merged.push(existingPallet);
      }

      seen.add(id);
    });

    (existing || []).forEach((existingPallet) => {
      const id = getPalletId(existingPallet);
      if (!id || seen.has(id)) {
        return;
      }
      merged.push(existingPallet);
    });

    return { pallets: merged, changes };
  },

  isOnHold(pallet) {
    return pallet && pallet.hold === true;
  },

  daysUntil(dateStr) {
    const now = new Date();
    const d = new Date(dateStr);
    return Math.floor((d - now) / (1000 * 60 * 60 * 24));
  },
};
