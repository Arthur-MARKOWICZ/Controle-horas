package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.dto.WorkLogResponse;
import com.controle_horas.Controle_horas.entity.CloseReason;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.exception.InvalidWorkLogStateException;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.List;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class DashboardService {

    public static final String NEXT_ACTION_ENTRY = "ENTRY";
    public static final String NEXT_ACTION_PAUSE_OR_EXIT = "PAUSE_OR_EXIT";
    public static final String NEXT_ACTION_RESUME = "RESUME";

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
        ensureNoOpenWorkLog(user);
        openWorkLog(user);
        return buildDashboard(user);
    }

    @Transactional
    public DashboardResponse registerPause(String email) {
        return closeOpenWorkLog(email, CloseReason.PAUSE, "There is no open entry to pause.");
    }

    @Transactional
    public DashboardResponse registerLunch(String email) {
        User user = userService.findUser(email);
        if (!user.isLunchEnabled()) {
            throw new IllegalArgumentException("Lunch registration is disabled for this user.");
        }
        return closeOpenWorkLog(user, CloseReason.LUNCH, "There is no open entry to register lunch.");
    }

    @Transactional
    public DashboardResponse registerResume(String email) {
        User user = userService.findUser(email);
        ensureNoOpenWorkLog(user);
        openWorkLog(user);
        return buildDashboard(user);
    }

    @Transactional
    public DashboardResponse registerExit(String email) {
        return closeOpenWorkLog(email, CloseReason.EXIT, "There is no open entry to register an exit.");
    }

    private DashboardResponse closeOpenWorkLog(String email, CloseReason closeReason, String missingMessage) {
        return closeOpenWorkLog(userService.findUser(email), closeReason, missingMessage);
    }

    private DashboardResponse closeOpenWorkLog(User user, CloseReason closeReason, String missingMessage) {
        WorkLog workLog = workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId())
                .orElseThrow(() -> new InvalidWorkLogStateException(missingMessage));
        workLog.close(Instant.now(clock), closeReason);
        return buildDashboard(user);
    }

    private void openWorkLog(User user) {
        WorkLog workLog = new WorkLog();
        workLog.setUser(user);
        workLog.setEntryAt(Instant.now(clock));
        workLogRepository.save(workLog);
    }

    private void ensureNoOpenWorkLog(User user) {
        if (workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()).isPresent()) {
            throw new InvalidWorkLogStateException("An entry is already open. Pause or register the exit first.");
        }
    }

    private DashboardResponse buildDashboard(User user) {
        LocalDate date = LocalDate.now(clock.withZone(WorkTimeCalculationService.DISPLAY_ZONE));
        Instant start = date.atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();
        Instant end = date.plusDays(1).atStartOfDay(WorkTimeCalculationService.DISPLAY_ZONE).toInstant();

        List<WorkLog> todayLogs = workLogRepository
                .findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(user.getId(), start, end);
        List<WorkLog> allLogs = workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId());

        int workedMinutesToday = workTimeCalculationService.sumClosedWorkedMinutes(todayLogs);
        int pausedMinutesToday = workTimeCalculationService.sumPausedMinutes(todayLogs);
        int balanceMinutesToday = workTimeCalculationService.calculateDailyBalanceMinutes(
                workedMinutesToday,
                date,
                user.getDailyWorkloadMinutes(),
                user.getWorkDays());
        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(
                todayLogs,
                date,
                user.getDailyWorkloadMinutes(),
                user.getWorkDays());
        LocalDate fromDate = workTimeCalculationService.toDisplayDate(user.getCreatedAt());
        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                allLogs,
                user.getDailyWorkloadMinutes(),
                user.getWorkDays(),
                fromDate,
                date);

        return new DashboardResponse(
                date,
                user.getDailyWorkloadMinutes(),
                user.getStandardEntryTime(),
                user.getStandardExitTime(),
                user.isLunchEnabled(),
                user.getLunchDurationMinutes(),
                user.getWorkDays(),
                resolveNextAction(todayLogs),
                expectedExitAt,
                workedMinutesToday,
                pausedMinutesToday,
                balanceMinutesToday,
                hourBankMinutes,
                todayLogs.stream().map(this::toResponse).toList());
    }

    private String resolveNextAction(List<WorkLog> todayLogs) {
        boolean hasOpenLog = todayLogs.stream().anyMatch(workLog -> workLog.getExitAt() == null);
        if (hasOpenLog) {
            return NEXT_ACTION_PAUSE_OR_EXIT;
        }

        CloseReason lastCloseReason = todayLogs.stream()
                .filter(workLog -> workLog.getExitAt() != null)
                .max(Comparator.comparing(WorkLog::getExitAt))
                .map(WorkLog::getCloseReason)
                .orElse(null);

        if (lastCloseReason != null && lastCloseReason.isTemporaryBreak()) {
            return NEXT_ACTION_RESUME;
        }
        return NEXT_ACTION_ENTRY;
    }

    private WorkLogResponse toResponse(WorkLog workLog) {
        return new WorkLogResponse(
                workLog.getId(),
                workLog.getEntryAt(),
                workLog.getExitAt(),
                workLog.getCloseReason() != null ? workLog.getCloseReason().name() : null);
    }
}
