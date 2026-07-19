package com.controle_horas.Controle_horas.dto;

import java.util.List;

public record WorkLogImportResponse(
        int importedCount,
        int errorCount,
        List<ImportErrorResponse> errors
) {
}
