package com.controle_horas.Controle_horas.dto;

import java.util.UUID;

/**
 * Request to assign or clear a manager.
 * {@code managerId} may be null to unassign the current manager.
 */
public record AssignManagerRequest(UUID managerId) {
}
