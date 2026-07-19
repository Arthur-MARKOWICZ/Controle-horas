package com.controle_horas.Controle_horas.controller;

import com.controle_horas.Controle_horas.dto.ApiResponse;
import com.controle_horas.Controle_horas.dto.AssignManagerRequest;
import com.controle_horas.Controle_horas.dto.CreateUserRequest;
import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.dto.UpdateUserRequest;
import com.controle_horas.Controle_horas.dto.UserResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.service.AccessControlService;
import com.controle_horas.Controle_horas.service.DashboardService;
import com.controle_horas.Controle_horas.service.HistoryService;
import com.controle_horas.Controle_horas.service.UserManagementService;
import jakarta.validation.Valid;
import java.security.Principal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/users")
@PreAuthorize("hasAnyRole('ADMIN', 'MANAGER')")
public class UserManagementController {

    private final UserManagementService userManagementService;
    private final AccessControlService accessControlService;
    private final DashboardService dashboardService;
    private final HistoryService historyService;

    public UserManagementController(
            UserManagementService userManagementService,
            AccessControlService accessControlService,
            DashboardService dashboardService,
            HistoryService historyService) {
        this.userManagementService = userManagementService;
        this.accessControlService = accessControlService;
        this.dashboardService = dashboardService;
        this.historyService = historyService;
    }

    @GetMapping
    public ResponseEntity<ApiResponse<List<UserResponse>>> listUsers(Principal principal) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Users retrieved successfully",
                userManagementService.listUsers(principal.getName())));
    }

    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> createUser(
            Principal principal,
            @Valid @RequestBody CreateUserRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(ApiResponse.ok(
                "User created successfully",
                userManagementService.createUser(principal.getName(), request)));
    }

    @PutMapping("/{userId}")
    public ResponseEntity<ApiResponse<UserResponse>> updateUser(
            Principal principal,
            @PathVariable UUID userId,
            @Valid @RequestBody UpdateUserRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                "User updated successfully",
                userManagementService.updateUser(principal.getName(), userId, request)));
    }

    @PutMapping("/{userId}/manager")
    @PreAuthorize("hasRole('ADMIN')")
    public ResponseEntity<ApiResponse<UserResponse>> assignManager(
            Principal principal,
            @PathVariable UUID userId,
            @RequestBody AssignManagerRequest request) {
        return ResponseEntity.ok(ApiResponse.ok(
                "Manager assigned successfully",
                userManagementService.assignManager(principal.getName(), userId, request)));
    }

    @GetMapping("/{userId}/dashboard")
    public ResponseEntity<ApiResponse<DashboardResponse>> getUserDashboard(
            Principal principal,
            @PathVariable UUID userId) {
        User actor = accessControlService.requireActor(principal.getName());
        User target = accessControlService.requireAccessibleUser(actor, userId);
        return ResponseEntity.ok(ApiResponse.ok(
                "Dashboard retrieved successfully",
                dashboardService.getToday(target.getEmail())));
    }

    @GetMapping("/{userId}/history")
    public ResponseEntity<ApiResponse<HistoryResponse>> getUserHistory(
            Principal principal,
            @PathVariable UUID userId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        User actor = accessControlService.requireActor(principal.getName());
        User target = accessControlService.requireAccessibleUser(actor, userId);
        return ResponseEntity.ok(ApiResponse.ok(
                "History retrieved successfully",
                historyService.getHistory(target.getEmail(), startDate, endDate)));
    }
}
