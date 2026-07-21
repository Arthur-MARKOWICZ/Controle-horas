package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.controle_horas.Controle_horas.entity.CloseReason;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.util.WorkDaysConverter;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WorkTimeCalculationServiceTest {

    private static final Set<DayOfWeek> WEEKDAYS = WorkDaysConverter.defaultWorkDays();
    private static final int DAILY_WORKLOAD = 530;

    private WorkTimeCalculationService workTimeCalculationService;

    @BeforeEach
    void setUp() {
        workTimeCalculationService = new WorkTimeCalculationService();
    }

    @Test
    void calculateExpectedExitAt_shouldUseFirstEntryOfTheDay() {
        WorkLog first = closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z", CloseReason.EXIT);
        WorkLog second = closedLog("2026-07-14T16:00:00Z", "2026-07-14T18:00:00Z", CloseReason.EXIT);

        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(List.of(second, first), 530);

        assertThat(expectedExitAt).isEqualTo(Instant.parse("2026-07-14T20:20:00Z"));
    }

    @Test
    void calculateExpectedExitAt_shouldExtendByPausedMinutes() {
        WorkLog morning = closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z", CloseReason.PAUSE);
        WorkLog afternoon = closedLog("2026-07-14T16:00:00Z", "2026-07-14T18:00:00Z", CloseReason.EXIT);

        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(
                List.of(morning, afternoon), 530);

        assertThat(expectedExitAt).isEqualTo(Instant.parse("2026-07-14T21:20:00Z"));
        assertThat(workTimeCalculationService.sumPausedMinutes(List.of(morning, afternoon))).isEqualTo(60);
    }

    @Test
    void calculateExpectedExitAt_shouldReturnNullWhenThereIsNoEntry() {
        assertThat(workTimeCalculationService.calculateExpectedExitAt(List.of(), 530)).isNull();
    }

    @Test
    void calculateExpectedExitAt_onNonWorkDay_shouldUseZeroWorkload() {
        WorkLog saturday = closedLog("2026-07-11T11:30:00Z", "2026-07-11T12:30:00Z", CloseReason.EXIT);
        LocalDate saturdayDate = LocalDate.of(2026, 7, 11);

        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(
                List.of(saturday), saturdayDate, DAILY_WORKLOAD, WEEKDAYS);

        assertThat(expectedExitAt).isEqualTo(Instant.parse("2026-07-11T11:30:00Z"));
    }

    @Test
    void sumClosedWorkedMinutes_shouldSumMultipleClosedPairsInTheSameDay() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:30:00Z", CloseReason.PAUSE),
                closedLog("2026-07-14T16:30:00Z", "2026-07-14T19:00:00Z", CloseReason.EXIT),
                openLog("2026-07-14T19:30:00Z"));

        assertThat(workTimeCalculationService.sumClosedWorkedMinutes(workLogs)).isEqualTo(390);
    }

    @Test
    void calculateDailyBalanceMinutes_shouldSupportPositiveNegativeAndZero() {
        assertThat(workTimeCalculationService.calculateDailyBalanceMinutes(560, 530)).isEqualTo(30);
        assertThat(workTimeCalculationService.calculateDailyBalanceMinutes(500, 530)).isEqualTo(-30);
        assertThat(workTimeCalculationService.calculateDailyBalanceMinutes(530, 530)).isZero();
    }

    @Test
    void calculateDailyBalanceMinutes_onSaturday_shouldCountAllWorkedAsPositive() {
        LocalDate saturday = LocalDate.of(2026, 7, 11);
        assertThat(workTimeCalculationService.calculateDailyBalanceMinutes(
                        120, saturday, DAILY_WORKLOAD, WEEKDAYS))
                .isEqualTo(120);
    }

    @Test
    void calculateExpectedExitAt_shouldIncludePlannedLunchWhenNotRegistered() {
        WorkLog entry = openLog("2026-07-14T11:30:00Z");

        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(
                List.of(entry), 470, true, 60);

        assertThat(expectedExitAt).isEqualTo(Instant.parse("2026-07-14T20:20:00Z"));
    }

    @Test
    void calculateExpectedExitAt_shouldNotDoubleCountLunchAfterRegistered() {
        WorkLog morning = closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z", CloseReason.LUNCH);
        WorkLog afternoon = openLog("2026-07-14T16:00:00Z");

        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(
                List.of(morning, afternoon), 470, true, 60);

        assertThat(expectedExitAt).isEqualTo(Instant.parse("2026-07-14T20:20:00Z"));
    }

    @Test
    void sumWorkedMinutesIncludingOpen_shouldAddOpenSession() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:30:00Z", CloseReason.PAUSE),
                openLog("2026-07-14T16:30:00Z"));

        int workedMinutes = workTimeCalculationService.sumWorkedMinutesIncludingOpen(
                workLogs, Instant.parse("2026-07-14T17:00:00Z"));

        assertThat(workedMinutes).isEqualTo(270);
    }

    @Test
    void sumClosedWorkedMinutesByDisplayDate_shouldSplitAcrossMidnight() {
        WorkLog overnight = closedLog("2026-07-14T02:00:00Z", "2026-07-14T04:00:00Z", CloseReason.EXIT);

        var minutesByDate = workTimeCalculationService.sumClosedWorkedMinutesByDisplayDate(List.of(overnight));

        assertThat(minutesByDate.get(LocalDate.of(2026, 7, 13))).isEqualTo(60);
        assertThat(minutesByDate.get(LocalDate.of(2026, 7, 14))).isEqualTo(60);
    }

    @Test
    void calculateHourBankMinutes_shouldIgnoreOpenJourney() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-13T11:30:00Z", "2026-07-13T20:20:00Z", CloseReason.EXIT),
                openLog("2026-07-14T11:30:00Z"));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 13),
                LocalDate.of(2026, 7, 14));

        assertThat(hourBankMinutes).isZero();
    }

    @Test
    void calculateHourBankMinutes_shouldIncludePastIncompletePausedDay() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-13T11:30:00Z", "2026-07-13T20:20:00Z", CloseReason.EXIT),
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z", CloseReason.PAUSE));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 13),
                LocalDate.of(2026, 7, 15));

        // Day 13 exact workload = 0; day 14 incomplete past: 210 - 530 = -320
        assertThat(hourBankMinutes).isEqualTo(-320);
    }

    @Test
    void calculateHourBankMinutes_shouldAccumulateAllClosedDays() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-13T11:30:00Z", "2026-07-13T21:00:00Z", CloseReason.EXIT),
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T21:00:00Z", CloseReason.EXIT),
                openLog("2026-07-15T12:00:00Z"));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 13),
                LocalDate.of(2026, 7, 15));

        assertThat(hourBankMinutes).isEqualTo(80);
    }

    @Test
    void calculateHourBankMinutes_shouldDebitPastWorkDayWithoutLogs() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T20:20:00Z", CloseReason.EXIT));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 13),
                LocalDate.of(2026, 7, 14));

        assertThat(hourBankMinutes).isEqualTo(-DAILY_WORKLOAD);
    }

    @Test
    void calculateHourBankMinutes_shouldNotDebitTodayWithoutLogs() {
        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                List.of(),
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 14),
                LocalDate.of(2026, 7, 14));

        assertThat(hourBankMinutes).isZero();
    }

    @Test
    void calculateHourBankMinutes_onSaturdayWork_shouldAddPositiveBalance() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-11T11:30:00Z", "2026-07-11T13:30:00Z", CloseReason.EXIT));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 11),
                LocalDate.of(2026, 7, 14));

        // Saturday +120; Sunday skipped; Monday absence -530; Tuesday (today) not debited yet
        assertThat(hourBankMinutes).isEqualTo(120 - DAILY_WORKLOAD);
    }

    @Test
    void sumPausedMinutes_shouldIncludeLunchGaps() {
        WorkLog morning = closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z", CloseReason.LUNCH);
        WorkLog afternoon = closedLog("2026-07-14T16:00:00Z", "2026-07-14T18:00:00Z", CloseReason.EXIT);

        assertThat(workTimeCalculationService.sumPausedMinutes(List.of(morning, afternoon))).isEqualTo(60);
        assertThat(workTimeCalculationService.isDayComplete(List.of(morning))).isFalse();
    }

    @Test
    void calculateHourBankMinutes_shouldIncludePastDayEndingInLunch() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-13T11:30:00Z", "2026-07-13T20:20:00Z", CloseReason.EXIT),
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z", CloseReason.LUNCH));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 13),
                LocalDate.of(2026, 7, 15));

        assertThat(hourBankMinutes).isEqualTo(-320);
    }

    @Test
    void calculateHourBankMinutes_shouldAttributeMidnightSpilloverToNextDay() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-14T02:00:00Z", "2026-07-14T04:00:00Z", CloseReason.EXIT));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(
                workLogs,
                DAILY_WORKLOAD,
                WEEKDAYS,
                LocalDate.of(2026, 7, 13),
                LocalDate.of(2026, 7, 14));

        // Day 13: 60 - 530 = -470; day 14 incomplete/today with spillover only via entry on 13 — day 14 has no entry logs
        // Entry is 2026-07-14T02:00Z = 2026-07-13 23:00 BRT, exit 04:00Z = 01:00 BRT on 14th
        // Day 13 complete (EXIT): 60 - 530 = -470
        // Day 14: empty dayLogs but workedMinutes spillover 60, pastDay=false (today) → not counted
        assertThat(hourBankMinutes).isEqualTo(60 - DAILY_WORKLOAD);
    }

    @Test
    void isWorkDay_shouldRespectConfiguredDays() {
        Set<DayOfWeek> mondayOnly = EnumSet.of(DayOfWeek.MONDAY);
        assertThat(workTimeCalculationService.isWorkDay(LocalDate.of(2026, 7, 13), mondayOnly)).isTrue();
        assertThat(workTimeCalculationService.isWorkDay(LocalDate.of(2026, 7, 14), mondayOnly)).isFalse();
    }

    private WorkLog closedLog(String entryAt, String exitAt, CloseReason closeReason) {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse(entryAt));
        workLog.close(Instant.parse(exitAt), closeReason);
        return workLog;
    }

    private WorkLog openLog(String entryAt) {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse(entryAt));
        return workLog;
    }
}
