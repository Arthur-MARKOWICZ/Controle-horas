package com.controle_horas.Controle_horas.repository;

import com.controle_horas.Controle_horas.entity.WorkLog;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface WorkLogRepository extends JpaRepository<WorkLog, UUID> {
    Optional<WorkLog> findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(UUID userId);
    List<WorkLog> findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
            UUID userId, Instant start, Instant end);
    List<WorkLog> findByUserIdOrderByEntryAtAsc(UUID userId);
}
