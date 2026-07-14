package com.controle_horas.Controle_horas.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Column(name = "daily_workload_minutes", nullable = false)
    private int dailyWorkloadMinutes = 530;

    @Column(name = "standard_entry_time", nullable = false)
    private LocalTime standardEntryTime = LocalTime.of(8, 30);

    @Column(name = "standard_exit_time", nullable = false)
    private LocalTime standardExitTime = LocalTime.of(17, 20);

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @PrePersist
    void onCreate() {
        Instant now = Instant.now();
        if (id == null) {
            id = UUID.randomUUID();
        }
        createdAt = now;
        updatedAt = now;
    }

    @PreUpdate
    void onUpdate() {
        updatedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public void setId(UUID id) {
        this.id = id;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getPasswordHash() {
        return passwordHash;
    }

    public void setPasswordHash(String passwordHash) {
        this.passwordHash = passwordHash;
    }

    public int getDailyWorkloadMinutes() {
        return dailyWorkloadMinutes;
    }

    public void setDailyWorkloadMinutes(int dailyWorkloadMinutes) {
        this.dailyWorkloadMinutes = dailyWorkloadMinutes;
    }

    public LocalTime getStandardEntryTime() {
        return standardEntryTime;
    }

    public void setStandardEntryTime(LocalTime standardEntryTime) {
        this.standardEntryTime = standardEntryTime;
        updateDailyWorkloadMinutesFromSchedule();
    }

    public LocalTime getStandardExitTime() {
        return standardExitTime;
    }

    public void setStandardExitTime(LocalTime standardExitTime) {
        this.standardExitTime = standardExitTime;
        updateDailyWorkloadMinutesFromSchedule();
    }

    public void updateWorkSchedule(LocalTime standardEntryTime, LocalTime standardExitTime) {
        this.standardEntryTime = standardEntryTime;
        this.standardExitTime = standardExitTime;
        updateDailyWorkloadMinutesFromSchedule();
    }

    private void updateDailyWorkloadMinutesFromSchedule() {
        if (standardEntryTime == null || standardExitTime == null || !standardExitTime.isAfter(standardEntryTime)) {
            return;
        }
        dailyWorkloadMinutes = Math.toIntExact(Duration.between(standardEntryTime, standardExitTime).toMinutes());
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
