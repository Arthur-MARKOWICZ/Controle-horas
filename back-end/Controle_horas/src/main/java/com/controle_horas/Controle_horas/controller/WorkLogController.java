package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.service.DashboardService;
import java.security.Principal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Registro de Ponto", description = "Endpoints para marcar entrada, pausa, almoço, retorno e saída")
@RestController
@RequestMapping("/api/work-logs")
public class WorkLogController {

    private final DashboardService dashboardService;

    public WorkLogController(DashboardService dashboardService) {
        this.dashboardService = dashboardService;
    }

    @Operation(summary = "Registrar entrada", description = "Marca o início da jornada de trabalho do dia")
    @PostMapping("/entry")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerEntry(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Entry registered successfully",
                dashboardService.registerEntry(principal.getName())));
    }

    @Operation(summary = "Registrar pausa", description = "Inicia uma pausa curta no expediente")
    @PostMapping("/pause")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerPause(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Pause registered successfully",
                dashboardService.registerPause(principal.getName())));
    }

    @Operation(summary = "Registrar almoço", description = "Inicia o horário de almoço/refeição")
    @PostMapping("/lunch")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerLunch(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Lunch registered successfully",
                dashboardService.registerLunch(principal.getName())));
    }

    @Operation(summary = "Registrar retorno", description = "Finaliza a pausa ou almoço e retoma o trabalho")
    @PostMapping("/resume")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerResume(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Resume registered successfully",
                dashboardService.registerResume(principal.getName())));
    }

    @Operation(summary = "Registrar saída", description = "Encerra o expediente de trabalho do dia")
    @PostMapping("/exit")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerExit(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Exit registered successfully",
                dashboardService.registerExit(principal.getName())));
    }
}
