package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.controle_horas.Controle_horas.entity.WorkLog;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class WorkTimeCalculationServiceTest {

    private WorkTimeCalculationService workTimeCalculationService;

    @BeforeEach
    void setUp() {
        workTimeCalculationService = new WorkTimeCalculationService();
    }

    @Test
    void calculateExpectedExitAt_shouldUseFirstEntryOfTheDay() {
        WorkLog first = closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:00:00Z");
        WorkLog second = closedLog("2026-07-14T16:00:00Z", "2026-07-14T18:00:00Z");

        Instant expectedExitAt = workTimeCalculationService.calculateExpectedExitAt(List.of(second, first), 530);

        assertThat(expectedExitAt).isEqualTo(Instant.parse("2026-07-14T20:20:00Z"));
    }

    @Test
    void calculateExpectedExitAt_shouldReturnNullWhenThereIsNoEntry() {
        assertThat(workTimeCalculationService.calculateExpectedExitAt(List.of(), 530)).isNull();
    }

    @Test
    void sumClosedWorkedMinutes_shouldSumMultipleClosedPairsInTheSameDay() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:30:00Z"),
                closedLog("2026-07-14T16:30:00Z", "2026-07-14T19:00:00Z"),
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
    void calculateHourBankMinutes_shouldIgnoreOpenJourney() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-13T11:30:00Z", "2026-07-13T20:20:00Z"),
                openLog("2026-07-14T11:30:00Z"));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(workLogs, 530);

        assertThat(hourBankMinutes).isZero();
    }

    @Test
    void calculateHourBankMinutes_shouldAccumulateAllClosedDays() {
        List<WorkLog> workLogs = List.of(
                closedLog("2026-07-13T11:30:00Z", "2026-07-13T21:00:00Z"),
                closedLog("2026-07-14T11:30:00Z", "2026-07-14T21:00:00Z"),
                openLog("2026-07-15T12:00:00Z"));

        int hourBankMinutes = workTimeCalculationService.calculateHourBankMinutes(workLogs, 530);

        assertThat(hourBankMinutes).isEqualTo(80);
    }

    private WorkLog closedLog(String entryAt, String exitAt) {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse(entryAt));
        workLog.setExitAt(Instant.parse(exitAt));
        return workLog;
    }

    private WorkLog openLog(String entryAt) {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse(entryAt));
        return workLog;
    }
}
