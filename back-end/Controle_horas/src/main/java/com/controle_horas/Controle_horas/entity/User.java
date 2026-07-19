package com.controle_horas.Controle_horas.entity;

import com.controle_horas.Controle_horas.util.WorkDaysConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalTime;
import java.util.Set;
import java.util.UUID;

@Entity
@Table(name = "users")
public class User {

    private static final int DEFAULT_LUNCH_DURATION_MINUTES = 60;
    private static final int MIN_DAILY_WORKLOAD_MINUTES = 1;
    private static final int MAX_DAILY_WORKLOAD_MINUTES = 1440;
    private static final int MAX_LUNCH_DURATION_MINUTES = 240;

    @Id
    @Column(nullable = false, updatable = false)
    private UUID id;

    @Column(nullable = false, length = 120)
    private String name;

    @Column(nullable = false, unique = true, length = 255)
    private String email;

    @Column(name = "password_hash", nullable = false, length = 255)
    private String passwordHash;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private UserRole role = UserRole.USER;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "manager_id")
    private User manager;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User createdBy;

    @Column(name = "daily_workload_minutes", nullable = false)
    private int dailyWorkloadMinutes = 470;

    @Column(name = "standard_entry_time", nullable = false)
    private LocalTime standardEntryTime = LocalTime.of(8, 30);

    @Column(name = "standard_exit_time", nullable = false)
    private LocalTime standardExitTime = LocalTime.of(17, 20);

    @Column(name = "lunch_enabled", nullable = false)
    private boolean lunchEnabled = true;

    @Column(name = "lunch_duration_minutes", nullable = false)
    private int lunchDurationMinutes = DEFAULT_LUNCH_DURATION_MINUTES;

    @Convert(converter = WorkDaysConverter.class)
    @Column(name = "work_days", nullable = false, length = 100)
    private Set<DayOfWeek> workDays = WorkDaysConverter.defaultWorkDays();

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
        if (role == null) {
            role = UserRole.USER;
        }
        if (workDays == null || workDays.isEmpty()) {
            workDays = WorkDaysConverter.defaultWorkDays();
        }
        createdAt = now;
        updatedAt = now;
        updateDailyWorkloadMinutesFromSchedule();
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

    public UserRole getRole() {
        return role;
    }

    public void setRole(UserRole role) {
        this.role = role;
    }

    public User getManager() {
        return manager;
    }

    public void setManager(User manager) {
        this.manager = manager;
    }

    public User getCreatedBy() {
        return createdBy;
    }

    public void setCreatedBy(User createdBy) {
        this.createdBy = createdBy;
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

    public boolean isLunchEnabled() {
        return lunchEnabled;
    }

    public void setLunchEnabled(boolean lunchEnabled) {
        this.lunchEnabled = lunchEnabled;
        updateDailyWorkloadMinutesFromSchedule();
    }

    public int getLunchDurationMinutes() {
        return lunchDurationMinutes;
    }

    public void setLunchDurationMinutes(int lunchDurationMinutes) {
        this.lunchDurationMinutes = lunchDurationMinutes;
        updateDailyWorkloadMinutesFromSchedule();
    }

    public Set<DayOfWeek> getWorkDays() {
        return workDays == null ? WorkDaysConverter.defaultWorkDays() : Set.copyOf(workDays);
    }

    public void setWorkDays(Set<DayOfWeek> workDays) {
        this.workDays = WorkDaysConverter.normalize(workDays);
    }

    public void updateWorkSchedule(
            LocalTime standardEntryTime,
            LocalTime standardExitTime,
            boolean lunchEnabled,
            int lunchDurationMinutes,
            Set<DayOfWeek> workDays) {
        this.standardEntryTime = standardEntryTime;
        this.standardExitTime = standardExitTime;
        this.lunchEnabled = lunchEnabled;
        this.lunchDurationMinutes = lunchDurationMinutes;
        this.workDays = WorkDaysConverter.normalize(workDays);
        updateDailyWorkloadMinutesFromSchedule();
    }

    public void updateWorkSchedule(
            LocalTime standardEntryTime,
            LocalTime standardExitTime,
            boolean lunchEnabled,
            int lunchDurationMinutes) {
        updateWorkSchedule(
                standardEntryTime,
                standardExitTime,
                lunchEnabled,
                lunchDurationMinutes,
                getWorkDays());
    }

    public void updateWorkSchedule(LocalTime standardEntryTime, LocalTime standardExitTime) {
        updateWorkSchedule(standardEntryTime, standardExitTime, lunchEnabled, lunchDurationMinutes);
    }

    private void updateDailyWorkloadMinutesFromSchedule() {
        if (standardEntryTime == null || standardExitTime == null || !standardExitTime.isAfter(standardEntryTime)) {
            return;
        }
        if (lunchDurationMinutes < 0 || lunchDurationMinutes > MAX_LUNCH_DURATION_MINUTES) {
            throw new IllegalArgumentException(
                    "Lunch duration must be between 0 and " + MAX_LUNCH_DURATION_MINUTES + " minutes");
        }
        int scheduleMinutes = Math.toIntExact(Duration.between(standardEntryTime, standardExitTime).toMinutes());
        int lunchMinutes = lunchEnabled ? lunchDurationMinutes : 0;
        int netWorkload = scheduleMinutes - lunchMinutes;
        if (netWorkload < MIN_DAILY_WORKLOAD_MINUTES || netWorkload > MAX_DAILY_WORKLOAD_MINUTES) {
            throw new IllegalArgumentException(
                    "Daily workload must be between " + MIN_DAILY_WORKLOAD_MINUTES
                            + " and " + MAX_DAILY_WORKLOAD_MINUTES + " minutes after lunch");
        }
        dailyWorkloadMinutes = netWorkload;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public void setCreatedAt(Instant createdAt) {
        this.createdAt = createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
