package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.service.HistoryExportService;
import com.controle_horas.Controle_horas.service.HistoryService;
import java.security.Principal;
import java.time.LocalDate;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Histórico e Relatórios", description = "Endpoints para consulta de histórico e exportação em Excel e PDF")
@RestController
@RequestMapping("/api/history")
public class HistoryController {

    private final HistoryService historyService;
    private final HistoryExportService historyExportService;

    public HistoryController(HistoryService historyService, HistoryExportService historyExportService) {
        this.historyService = historyService;
        this.historyExportService = historyExportService;
    }

    @Operation(summary = "Consultar histórico de registros", description = "Retorna o histórico de ponto e saldo de horas em um intervalo de datas")
    @GetMapping
    public ResponseEntity<ApiResponse<HistoryResponse>> getHistory(
            Principal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        HistoryResponse history = historyService.getHistory(principal.getName(), startDate, endDate);
        return ResponseEntity.ok(ApiResponse.ok("History retrieved successfully", history));
    }

    @Operation(summary = "Exportar histórico em Excel (.xlsx)", description = "Gera um relatório em planilha Excel para o período selecionado")
    @GetMapping("/export.xlsx")
    public ResponseEntity<byte[]> exportExcel(
            Principal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        byte[] content = historyExportService.exportExcel(principal.getName(), startDate, endDate);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"historico-horas.xlsx\"")
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(content);
    }

    @Operation(summary = "Exportar histórico em PDF (.pdf)", description = "Gera um documento PDF com o relatório detalhado do histórico")
    @GetMapping("/export.pdf")
    public ResponseEntity<byte[]> exportPdf(
            Principal principal,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        byte[] content = historyExportService.exportPdf(principal.getName(), startDate, endDate);
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"historico-horas.pdf\"")
                .contentType(MediaType.APPLICATION_PDF)
                .body(content);
    }
}
