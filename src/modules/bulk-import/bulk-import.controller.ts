import type { Request, Response, NextFunction } from "express";
import { processBulkPropertyRows } from "./bulk-import.service";
import { ApiError } from "../../middleware/error-handler";
import { logAudit } from "../../lib/audit";

export async function handleBulkImport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    const { rows, commit } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ApiError(400, "Invalid payload. 'rows' array is required.");
    }

    if (rows.length > 500) {
      throw new ApiError(400, "Maximum batch limit is 500 properties per upload.");
    }

    const isCommit = commit === true || commit === "true";
    const result = await processBulkPropertyRows(rows, isCommit);

    if (isCommit && result.importedCodes.length > 0) {
      await logAudit({
        actorId: admin.id,
        action: "PROPERTIES_BULK_IMPORTED",
        targetEntity: "Property",
        targetId: `BATCH_${Date.now()}`,
        details: {
          importedCount: result.importedCodes.length,
          codes: result.importedCodes,
        },
      });
    }

    res.status(200).json({
      success: true,
      committed: isCommit,
      summary: {
        totalRows: result.totalRows,
        validCount: result.validCount,
        errorCount: result.errorCount,
        importedCount: result.importedCodes.length,
      },
      errors: result.errors,
      importedCodes: result.importedCodes,
    });
  } catch (error) {
    next(error);
  }
}
