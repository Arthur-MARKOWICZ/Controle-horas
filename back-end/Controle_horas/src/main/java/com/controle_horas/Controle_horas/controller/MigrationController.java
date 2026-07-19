package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.WorkLogImportResponse;
import com.controle_horas.Controle_horas.service.WorkLogImportService;
import java.security.Principal;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/migrations")
public class MigrationController {

    private final WorkLogImportService workLogImportService;

    public MigrationController(WorkLogImportService workLogImportService) {
        this.workLogImportService = workLogImportService;
    }

    @GetMapping("/template.csv")
    public ResponseEntity<byte[]> downloadCsvTemplate() {
        byte[] content = workLogImportService.buildCsvTemplate();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"work-logs-template.csv\"")
                .contentType(MediaType.parseMediaType("text/csv"))
                .body(content);
    }

    @GetMapping("/template.xlsx")
    public ResponseEntity<byte[]> downloadXlsxTemplate() {
        byte[] content = workLogImportService.buildXlsxTemplate();
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"work-logs-template.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(content);
    }

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
