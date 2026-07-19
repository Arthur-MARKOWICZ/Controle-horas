package com.controle_horas.Controle_horas.repository;

import com.controle_horas.Controle_horas.entity.WorkLog;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkLogRepository extends JpaRepository<WorkLog, UUID> {

    Optional<WorkLog> findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(UUID userId);

    List<WorkLog> findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
            UUID userId, Instant start, Instant end);

    List<WorkLog> findByUserIdOrderByEntryAtAsc(UUID userId);

    @Query("""
            SELECT workLog FROM WorkLog workLog
            WHERE workLog.user.id = :userId
              AND workLog.entryAt < :exitAt
              AND (workLog.exitAt IS NULL OR workLog.exitAt > :entryAt)
            """)
    List<WorkLog> findOverlapping(
            @Param("userId") UUID userId,
            @Param("entryAt") Instant entryAt,
            @Param("exitAt") Instant exitAt);
}
