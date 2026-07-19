package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.HistoryDayResponse;
import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.dto.WorkLogResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HistoryService {

    private final WorkLogRepository workLogRepository;
    private final UserService userService;
    private final WorkTimeCalculationService workTimeCalculationService;
    private final Clock clock;

    public HistoryService(
            WorkLogRepository workLogRepository,
            UserService userService,
            WorkTimeCalculationService workTimeCalculationService,
            Clock clock) {
        this.workLogRepository = workLogRepository;
        this.userService = userService;
        this.workTimeCalculationService = workTimeCalculationService;
        this.clock = clock;
    }

    @Transactional(readOnly = true)
    public HistoryResponse getHistory(String email, LocalDate startDate, LocalDate endDate) {
        validatePeriod(startDate, endDate);

        User user = userService.findUser(email);
        Instant rangeStart = startDate.atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();
        Instant rangeEnd = endDate.plusDays(1).atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();

        List<WorkLog> periodLogs = workLogRepository
                .findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        user.getId(), rangeStart, rangeEnd);
        List<WorkLog> allLogs = workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId());

        Set<DayOfWeek> workDays = user.getWorkDays();
        int dailyWorkloadMinutes = user.getDailyWorkloadMinutes();
        LocalDate today = LocalDate.now(clock.withZone(WorkTimeCalculationService.DISPLAY_ZONE));
        LocalDate fromDate = workTimeCalculationService.toDisplayDate(user.getCreatedAt());

        Map<LocalDate, List<WorkLog>> logsByDate = workTimeCalculationService.groupByDisplayDate(periodLogs);
        List<HistoryDayResponse> days = buildHistoryDays(
                startDate,
                endDate,
                today,
                fromDate,
                logsByDate,
                dailyWorkloadMinutes,
                workDays);

        int totalWorkedMinutes = days.stream().mapToInt(HistoryDayResponse::workedMinutes).sum();
        int totalBalanceMinutes = days.stream().mapToInt(HistoryDayResponse::balanceMinutes).sum();
        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                allLogs,
                dailyWorkloadMinutes,
                workDays,
                fromDate,
                today);

        return new HistoryResponse(
                startDate,
                endDate,
                totalWorkedMinutes,
                totalBalanceMinutes,
                hourBankMinutes,
                days);
    }

    private List<HistoryDayResponse> buildHistoryDays(
            LocalDate startDate,
            LocalDate endDate,
            LocalDate today,
            LocalDate fromDate,
            Map<LocalDate, List<WorkLog>> logsByDate,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays) {
        List<HistoryDayResponse> days = new ArrayList<>();

        for (LocalDate date = startDate; !date.isAfter(endDate); date = date.plusDays(1)) {
            List<WorkLog> dayLogs = logsByDate.getOrDefault(date, List.of());
            if (!dayLogs.isEmpty()) {
                days.add(toDayResponse(date, dayLogs, dailyWorkloadMinutes, workDays));
                continue;
            }

            boolean pastWorkDayWithoutLogs = !date.isAfter(today)
                    && date.isBefore(today)
                    && !date.isBefore(fromDate)
                    && workTimeCalculationService.isWorkDay(date, workDays);
            if (pastWorkDayWithoutLogs) {
                days.add(toAbsenceDayResponse(date, dailyWorkloadMinutes));
            }
        }

        return days;
    }

    private HistoryDayResponse toDayResponse(
            LocalDate date,
            List<WorkLog> dayLogs,
            int dailyWorkloadMinutes,
            Set<DayOfWeek> workDays) {
        int workedMinutes = workTimeCalculationService.sumClosedWorkedMinutes(dayLogs);
        int balanceMinutes = workTimeCalculationService.calculateDailyBalanceMinutes(
                workedMinutes, date, dailyWorkloadMinutes, workDays);
        int pausedMinutes = workTimeCalculationService.sumPausedMinutes(dayLogs);
        boolean isComplete = workTimeCalculationService.isDayComplete(dayLogs);

        Instant firstEntryAt = dayLogs.stream()
                .map(WorkLog::getEntryAt)
                .filter(Objects::nonNull)
                .min(Comparator.naturalOrder())
                .orElse(null);

        Instant lastExitAt = dayLogs.stream()
                .map(WorkLog::getExitAt)
                .filter(Objects::nonNull)
                .max(Comparator.naturalOrder())
                .orElse(null);

        List<WorkLogResponse> workLogs = dayLogs.stream()
                .map(workLog -> new WorkLogResponse(
                        workLog.getId(),
                        workLog.getEntryAt(),
                        workLog.getExitAt(),
                        workLog.getCloseReason() != null ? workLog.getCloseReason().name() : null))
                .toList();

        return new HistoryDayResponse(
                date,
                firstEntryAt,
                lastExitAt,
                workedMinutes,
                pausedMinutes,
                balanceMinutes,
                isComplete,
                workLogs);
    }

    private HistoryDayResponse toAbsenceDayResponse(LocalDate date, int dailyWorkloadMinutes) {
        return new HistoryDayResponse(
                date,
                null,
                null,
                0,
                0,
                -dailyWorkloadMinutes,
                true,
                List.of());
    }

    private void validatePeriod(LocalDate startDate, LocalDate endDate) {
        if (startDate == null || endDate == null) {
            throw new IllegalArgumentException("startDate and endDate are required.");
        }
        if (startDate.isAfter(endDate)) {
            throw new IllegalArgumentException("startDate must be less than or equal to endDate.");
        }
    }
}
