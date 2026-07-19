package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.UserRole;
import com.controle_horas.Controle_horas.exception.ForbiddenOperationException;
import com.controle_horas.Controle_horas.exception.ResourceNotFoundException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Queue;
import java.util.Set;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccessControlService {

    private final UserRepository userRepository;

    public AccessControlService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public User requireActor(String email) {
        return userRepository.findByEmail(email.toLowerCase())
                .orElseThrow(() -> new ResourceNotFoundException("Authenticated user not found"));
    }

    @Transactional(readOnly = true)
    public User requireAccessibleUser(User actor, UUID targetUserId) {
        User target = userRepository.findById(targetUserId)
                .orElseThrow(() -> new ResourceNotFoundException("User not found"));
        assertCanAccess(actor, target);
        return target;
    }

    public void assertCanAccess(User actor, User target) {
        if (canAccess(actor, target)) {
            return;
        }
        throw new ForbiddenOperationException("You do not have permission to access this user");
    }

    public boolean canAccess(User actor, User target) {
        if (actor.getId().equals(target.getId())) {
            return true;
        }
        if (actor.getRole() == UserRole.ADMIN) {
            return isInCreatedBySubtree(actor, target);
        }
        if (actor.getRole() == UserRole.MANAGER) {
            return target.getManager() != null && actor.getId().equals(target.getManager().getId());
        }
        return false;
    }

    public boolean canManageUsers(User actor) {
        return actor.getRole() == UserRole.ADMIN || actor.getRole() == UserRole.MANAGER;
    }

    public void assertCanManageUsers(User actor) {
        if (!canManageUsers(actor)) {
            throw new ForbiddenOperationException("You do not have permission to manage users");
        }
    }

    public void assertCanImportForEmail(User actor, String targetEmail) {
        User target = userRepository.findByEmail(targetEmail.toLowerCase())
                .orElseThrow(() -> new ResourceNotFoundException("User not found for email: " + targetEmail));
        assertCanAccess(actor, target);
    }

    @Transactional(readOnly = true)
    public List<User> listAccessibleUsers(User actor) {
        if (actor.getRole() == UserRole.ADMIN) {
            return listCreatedBySubtree(actor);
        }
        if (actor.getRole() == UserRole.MANAGER) {
            List<User> team = new ArrayList<>();
            team.add(actor);
            team.addAll(userRepository.findByManagerIdOrderByNameAsc(actor.getId()));
            return team;
        }
        return List.of(actor);
    }

    private boolean isInCreatedBySubtree(User actor, User target) {
        User current = target;
        Set<UUID> visited = new HashSet<>();
        while (current.getCreatedBy() != null) {
            UUID createdById = current.getCreatedBy().getId();
            if (!visited.add(createdById)) {
                return false;
            }
            if (actor.getId().equals(createdById)) {
                return true;
            }
            current = current.getCreatedBy();
        }
        return false;
    }

    private List<User> listCreatedBySubtree(User root) {
        List<User> result = new ArrayList<>();
        result.add(root);

        Queue<UUID> queue = new ArrayDeque<>();
        queue.add(root.getId());
        Set<UUID> visited = new HashSet<>();
        visited.add(root.getId());

        while (!queue.isEmpty()) {
            UUID currentId = queue.poll();
            List<User> children = userRepository.findByCreatedByIdOrderByNameAsc(currentId);
            for (User child : children) {
                if (!visited.add(child.getId())) {
                    continue;
                }
                result.add(child);
                queue.add(child.getId());
            }
        }
        return result;
    }
}
