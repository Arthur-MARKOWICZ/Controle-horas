package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.service.DashboardService;
import java.security.Principal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/work-logs")
public class WorkLogController {
    private final DashboardService dashboardService;
    public WorkLogController(DashboardService dashboardService) { this.dashboardService = dashboardService; }

    @PostMapping("/entry")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerEntry(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok("Entry registered successfully", dashboardService.registerEntry(principal.getName())));
    }

    @PostMapping("/exit")
    public ResponseEntity<ApiResponse<DashboardResponse>> registerExit(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok("Exit registered successfully", dashboardService.registerExit(principal.getName())));
    }
}
