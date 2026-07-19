package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.AssignManagerRequest;
import com.controle_horas.Controle_horas.dto.CreateUserRequest;
import com.controle_horas.Controle_horas.dto.UpdateUserRequest;
import com.controle_horas.Controle_horas.dto.UserResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.UserRole;
import com.controle_horas.Controle_horas.exception.EmailAlreadyRegisteredException;
import com.controle_horas.Controle_horas.exception.ForbiddenOperationException;
import com.controle_horas.Controle_horas.exception.ResourceNotFoundException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import com.controle_horas.Controle_horas.util.WorkDaysConverter;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserManagementService {

    private final UserRepository userRepository;
    private final AccessControlService accessControlService;
    private final PasswordEncoder passwordEncoder;

    public UserManagementService(
            UserRepository userRepository,
            AccessControlService accessControlService,
            PasswordEncoder passwordEncoder) {
        this.userRepository = userRepository;
        this.accessControlService = accessControlService;
        this.passwordEncoder = passwordEncoder;
    }

    @Transactional(readOnly = true)
    public List<UserResponse> listUsers(String actorEmail) {
        User actor = accessControlService.requireActor(actorEmail);
        accessControlService.assertCanManageUsers(actor);
        return accessControlService.listAccessibleUsers(actor).stream()
                .map(this::toResponse)
                .toList();
    }

    @Transactional
    public UserResponse createUser(String actorEmail, CreateUserRequest request) {
        User actor = accessControlService.requireActor(actorEmail);
        accessControlService.assertCanManageUsers(actor);

        String normalizedEmail = request.email().trim().toLowerCase();
        if (userRepository.existsByEmail(normalizedEmail)) {
            throw new EmailAlreadyRegisteredException("Email is already registered");
        }

        UserRole requestedRole = parseRole(request.role());
        validateRoleAssignment(actor, requestedRole);

        User user = new User();
        user.setName(request.name().trim());
        user.setEmail(normalizedEmail);
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        user.setRole(requestedRole);
        user.setCreatedBy(actor);

        applySchedule(
                user,
                request.standardEntryTime(),
                request.standardExitTime(),
                request.lunchEnabled(),
                request.lunchDurationMinutes(),
                request.workDays());
        assignManagerOnCreate(actor, user, requestedRole, request.managerId());

        return toResponse(userRepository.save(user));
    }

    @Transactional
    public UserResponse updateUser(String actorEmail, UUID userId, UpdateUserRequest request) {
        User actor = accessControlService.requireActor(actorEmail);
        accessControlService.assertCanManageUsers(actor);
        User target = accessControlService.requireAccessibleUser(actor, userId);

        target.setName(request.name().trim());

        if (request.role() != null && !request.role().isBlank()) {
            UserRole newRole = parseRole(request.role());
            if (newRole != target.getRole()) {
                if (actor.getRole() != UserRole.ADMIN) {
                    throw new ForbiddenOperationException("Only administrators can change user roles");
                }
                validateRoleAssignment(actor, newRole);
                target.setRole(newRole);
                if (newRole == UserRole.ADMIN) {
                    target.setManager(null);
                }
            }
        }

        if (actor.getRole() == UserRole.ADMIN
                && target.getRole() != UserRole.ADMIN
                && request.managerId() != null) {
            applyManager(actor, target, request.managerId());
        }

        applySchedule(
                target,
                request.standardEntryTime(),
                request.standardExitTime(),
                request.lunchEnabled(),
                request.lunchDurationMinutes(),
                request.workDays());
        return toResponse(target);
    }

    @Transactional
    public UserResponse assignManager(String actorEmail, UUID userId, AssignManagerRequest request) {
        User actor = accessControlService.requireActor(actorEmail);
        if (actor.getRole() != UserRole.ADMIN) {
            throw new ForbiddenOperationException("Only administrators can assign managers");
        }

        User target = accessControlService.requireAccessibleUser(actor, userId);

        if (target.getRole() == UserRole.ADMIN) {
            throw new IllegalArgumentException("Administrators cannot have a manager");
        }

        applyManager(actor, target, request.managerId());
        return toResponse(target);
    }

    private void assignManagerOnCreate(User actor, User user, UserRole role, UUID managerId) {
        if (actor.getRole() == UserRole.MANAGER) {
            if (role != UserRole.USER) {
                throw new ForbiddenOperationException("Managers can only create common users");
            }
            user.setManager(actor);
            return;
        }

        if (role == UserRole.ADMIN) {
            user.setManager(null);
            return;
        }

        if (managerId != null) {
            applyManager(actor, user, managerId);
            return;
        }

        user.setManager(actor);
    }

    private void applyManager(User actor, User target, UUID managerId) {
        if (managerId == null) {
            target.setManager(null);
            return;
        }
        if (managerId.equals(target.getId())) {
            throw new IllegalArgumentException("A user cannot be their own manager");
        }
        User manager = userRepository.findById(managerId)
                .orElseThrow(() -> new ResourceNotFoundException("Manager not found"));
        accessControlService.assertCanAccess(actor, manager);
        if (manager.getRole() != UserRole.MANAGER && manager.getRole() != UserRole.ADMIN) {
            throw new IllegalArgumentException("Assigned manager must have MANAGER or ADMIN role");
        }
        target.setManager(manager);
    }

    private void applySchedule(
            User user,
            LocalTime entry,
            LocalTime exit,
            Boolean lunchEnabled,
            Integer lunchDurationMinutes,
            Set<DayOfWeek> workDays) {
        boolean hasScheduleUpdate = entry != null || exit != null
                || lunchEnabled != null || lunchDurationMinutes != null
                || workDays != null;
        if (!hasScheduleUpdate) {
            return;
        }
        LocalTime standardEntry = entry != null ? entry : user.getStandardEntryTime();
        LocalTime standardExit = exit != null ? exit : user.getStandardExitTime();
        boolean enabled = lunchEnabled != null ? lunchEnabled : user.isLunchEnabled();
        int duration = lunchDurationMinutes != null ? lunchDurationMinutes : user.getLunchDurationMinutes();
        Set<DayOfWeek> selectedWorkDays = workDays != null
                ? WorkDaysConverter.normalize(workDays)
                : user.getWorkDays();
        if (!standardExit.isAfter(standardEntry)) {
            throw new IllegalArgumentException("Standard exit time must be after standard entry time");
        }
        user.updateWorkSchedule(standardEntry, standardExit, enabled, duration, selectedWorkDays);
    }

    private void validateRoleAssignment(User actor, UserRole role) {
        if (actor.getRole() == UserRole.MANAGER && role != UserRole.USER) {
            throw new ForbiddenOperationException("Managers can only assign the USER role");
        }
    }

    private UserRole parseRole(String role) {
        try {
            return UserRole.valueOf(role.trim().toUpperCase());
        } catch (Exception exception) {
            throw new IllegalArgumentException("Invalid role. Allowed values: ADMIN, MANAGER, USER");
        }
    }

    private UserResponse toResponse(User user) {
        User manager = user.getManager();
        User createdBy = user.getCreatedBy();
        return new UserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole().name(),
                manager != null ? manager.getId() : null,
                manager != null ? manager.getName() : null,
                createdBy != null ? createdBy.getId() : null,
                user.getDailyWorkloadMinutes(),
                user.getStandardEntryTime(),
                user.getStandardExitTime(),
                user.isLunchEnabled(),
                user.getLunchDurationMinutes(),
                user.getWorkDays());
    }
}
