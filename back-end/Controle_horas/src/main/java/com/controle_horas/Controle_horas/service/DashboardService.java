package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.dto.WorkLogResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.exception.InvalidWorkLogStateException;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DashboardService {

    private final WorkLogRepository workLogRepository;
    private final UserService userService;
    private final WorkTimeCalculationService workTimeCalculationService;
    private final Clock clock;

    public DashboardService(
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
    public DashboardResponse getToday(String email) {
        return buildDashboard(userService.findUser(email));
    }

    @Transactional
    public DashboardResponse registerEntry(String email) {
        User user = userService.findUser(email);
        if (workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()).isPresent()) {
            throw new InvalidWorkLogStateException("An entry is already open. Register the exit first.");
        }
        WorkLog workLog = new WorkLog();
        workLog.setUser(user);
        workLog.setEntryAt(Instant.now(clock));
        workLogRepository.save(workLog);
        return buildDashboard(user);
    }

    @Transactional
    public DashboardResponse registerExit(String email) {
        User user = userService.findUser(email);
        WorkLog workLog = workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId())
                .orElseThrow(() -> new InvalidWorkLogStateException("There is no open entry to register an exit."));
        workLog.setExitAt(Instant.now(clock));
        return buildDashboard(user);
    }

    private DashboardResponse buildDashboard(User user) {
        LocalDate date = LocalDate.now(clock.withZone(WorkTimeCalculationService.DISPLAY_ZONE));
        Instant start = date.atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();
        Instant end = date.plusDays(1).atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();

        List<WorkLog> todayLogs = workLogRepository
                .findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(user.getId(), start, end);
        List<WorkLog> allLogs = workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId());

        int workedMinutesToday = workTimeCalculationService.sumClosedWorkedMinutes(todayLogs);
        int balanceMinutesToday = workTimeCalculationService.calculateDailyBalanceMinutes(
                workedMinutesToday, user.getDailyWorkloadMinutes());
        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(
                todayLogs, user.getDailyWorkloadMinutes());
        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                allLogs, user.getDailyWorkloadMinutes());

        boolean hasOpenLog = workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()).isPresent();

        return new DashboardResponse(
                date,
                user.getDailyWorkloadMinutes(),
                user.getStandardEntryTime(),
                user.getStandardExitTime(),
                hasOpenLog ? "EXIT" : "ENTRY",
                expectedExitAt,
                workedMinutesToday,
                balanceMinutesToday,
                hourBankMinutes,
                todayLogs.stream().map(this::toResponse).toList());
    }

    private WorkLogResponse toResponse(WorkLog workLog) {
        return new WorkLogResponse(workLog.getId(), workLog.getEntryAt(), workLog.getExitAt());
    }
}
