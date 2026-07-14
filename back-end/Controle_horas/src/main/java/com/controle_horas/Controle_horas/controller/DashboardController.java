package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.service.DashboardService;
import java.security.Principal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/dashboard")
public class DashboardController {
    private final DashboardService dashboardService;

    public DashboardController(DashboardService dashboardService) { this.dashboardService = dashboardService; }

    @GetMapping("/today")
    public ResponseEntity<ApiResponse<DashboardResponse>> getToday(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok("Dashboard retrieved successfully", dashboardService.getToday(principal.getName())));
    }
}
