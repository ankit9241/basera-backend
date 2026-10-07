import type { Request, Response, NextFunction } from "express";
import { processBulkPropertyRows } from "./bulk-import.service";
import { parseCsvDetailed, CANONICAL_CSV_TEMPLATE } from "./csv-parser";
import { ApiError } from "../../middleware/error-handler";
import { logAudit } from "../../lib/audit";

export async function handleBulkImport(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const admin = req.admin!;
    let { rows, commit, csv } = req.body;
    let warnings: string[] = [];

    if (!rows && typeof csv === "string") {
      const parsed = parseCsvDetailed(csv);
      rows = parsed.rows;
      warnings = parsed.warnings;
    }

    if (!Array.isArray(rows) || rows.length === 0) {
      throw new ApiError(400, "Invalid payload. 'rows' array or 'csv' content is required.");
    }

    if (rows.length > 500) {
      throw new ApiError(400, "Maximum batch limit is 500 properties per upload.");
    }

    const isCommit = commit === true || commit === "true";
    const result = await processBulkPropertyRows(rows, isCommit);

    if (isCommit && (result.importedCodes.length > 0 || result.updatedCodes.length > 0)) {
      await logAudit({
        actorId: admin.id,
        action: "PROPERTIES_BULK_IMPORTED",
        targetEntity: "Property",
        targetId: `BATCH_${Date.now()}`,
        details: {
          importedCount: result.importedCodes.length,
          updatedCount: result.updatedCodes.length,
          codes: [...result.importedCodes, ...result.updatedCodes],
        },
      });
    }

    res.status(200).json({
      success: true,
      committed: isCommit,
      summary: {
        totalRows: result.totalRows,
        validCount: result.validCount,
        newCount: result.newCount,
        updateCount: result.updateCount,
        unchangedCount: result.unchangedCount,
        errorCount: result.errorCount,
        importedCount: result.importedCodes.length,
        updatedCount: result.updatedCodes.length,
      },
      warnings,
      errors: result.errors,
      rowActions: result.rowActions,
      importedCodes: result.importedCodes,
      updatedCodes: result.updatedCodes,
    });
  } catch (error) {
    next(error);
  }
}

export async function getBulkImportTemplate(
  _req: Request,
  res: Response
): Promise<void> {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="basera_listings_template.csv"');
  res.status(200).send(CANONICAL_CSV_TEMPLATE);
}
