package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.CurrentUserResponse;
import com.controle_horas.Controle_horas.dto.DailyWorkloadRequest;
import com.controle_horas.Controle_horas.dto.DailyWorkloadResponse;
import com.controle_horas.Controle_horas.service.UserService;
import jakarta.validation.Valid;
import java.security.Principal;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users/me")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<CurrentUserResponse>> getCurrentUser(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Current user retrieved successfully",
                userService.getCurrentUser(principal.getName())));
    }

    @PutMapping("/daily-workload")
    public ResponseEntity<ApiResponse<DailyWorkloadResponse>> updateDailyWorkload(
            Principal principal, @Valid @RequestBody DailyWorkloadRequest request) {
        return ResponseEntity.ok(ApiResponse.ok("Daily workload updated successfully",
                userService.updateDailyWorkload(
                        principal.getName(),
                        request.standardEntryTime(),
                        request.standardExitTime(),
                        request.lunchEnabled(),
                        request.lunchDurationMinutes(),
                        request.workDays())));
    }
}
