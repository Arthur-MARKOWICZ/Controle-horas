package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.WorkLogImportResponse;
import com.controle_horas.Controle_horas.service.WorkLogImportService;
import java.security.Principal;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Migração e Importação (Admin)", description = "Endpoints para download de templates e importação de registros de ponto via arquivo CSV/XLSX")
@RestController
@RequestMapping("/api/migrations")
@PreAuthorize("hasRole('ADMIN')")
public class MigrationController {

    private final WorkLogImportService workLogImportService;

    public MigrationController(WorkLogImportService workLogImportService) {
        this.workLogImportService = workLogImportService;
    }

    @Operation(summary = "Baixar template CSV", description = "Download do modelo de arquivo CSV para importação de pontos")
    @GetMapping("/template.csv")
    public ResponseEntity<byte[]> downloadCsvTemplate() {
        byte[] content = workLogImportService.buildCsvTemplate();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"work-logs-template.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(content);
    }

    @Operation(summary = "Baixar template XLSX", description = "Download do modelo de planilha Excel (.xlsx) para importação de pontos")
    @GetMapping("/template.xlsx")
    public ResponseEntity<byte[]> downloadXlsxTemplate() {
        byte[] content = workLogImportService.buildXlsxTemplate();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"work-logs-template.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(content);
    }

    @Operation(summary = "Importar arquivo de pontos", description = "Realiza a leitura e carga em lote de registros de ponto a partir de arquivo CSV ou XLSX")
    @PostMapping(value = "/import", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ApiResponse<WorkLogImportResponse>> importWorkLogs(
            Principal principal,
            @RequestPart("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is required");
        }
        return ResponseEntity.ok(ApiResponse.ok(
                "Import finished",
                workLogImportService.importFile(principal.getName(), file)));
    }
}
