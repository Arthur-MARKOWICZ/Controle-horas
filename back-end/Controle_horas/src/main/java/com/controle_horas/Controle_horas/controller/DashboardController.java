package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.service.DashboardService;
import java.security.Principal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;

@Tag(name = "Dashboard", description = "Endpoints para consulta do painel principal do usuário")
@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) { this.dashboardService = dashboardService; }

    @Operation(summary = "Obter dados do dashboard do dia", description = "Retorna os registros de ponto e resumos de horas para o dia atual do usuário autenticado")
    @GetMapping("/today")
    public ResponseEntity<ApiResponse<DashboardResponse>> getToday(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok("Dashboard retrieved successfully", dashboardService.getToday(principal.getName())));
    }
}
