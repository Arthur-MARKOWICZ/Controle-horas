package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.entity.CloseReason;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class HistoryServiceTest {

    @Mock private WorkLogRepository workLogRepository;
    @Mock private UserService userService;

    private HistoryService historyService;
    private User user;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-07-14T12:00:00Z"), ZoneOffset.UTC);
        historyService = new HistoryService(
                workLogRepository, userService, new WorkTimeCalculationService(), clock);
        user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("arthur@example.com");
        user.setDailyWorkloadMinutes(530);
        user.setCreatedAt(Instant.parse("2026-07-13T03:00:00Z"));
    }

    @Test
    void getHistory_shouldRejectInvalidPeriod() {
        assertThatThrownBy(() -> historyService.getHistory(
                        user.getEmail(), LocalDate.of(2026, 7, 14), LocalDate.of(2026, 7, 1)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("startDate must be less than or equal to endDate");
    }

    @Test
    void getHistory_shouldRejectPeriodLongerThanMaxDays() {
        assertThatThrownBy(() -> historyService.getHistory(
                        user.getEmail(),
                        LocalDate.of(2026, 1, 1),
                        LocalDate.of(2026, 1, 1).plusDays(HistoryService.MAX_PERIOD_DAYS + 1)))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("Period must be at most " + HistoryService.MAX_PERIOD_DAYS + " days");
    }

    @Test
    void getHistory_shouldReturnDailySummaryAndTotals() {
        WorkLog dayOne = closedLog("2026-07-13T11:30:00Z", "2026-07-13T21:00:00Z");
        WorkLog dayTwoMorning = closedLog("2026-07-14T11:30:00Z", "2026-07-14T15:30:00Z");
        WorkLog dayTwoOpen = openLog("2026-07-14T16:30:00Z");

        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        eq(user.getId()), any(), any()))
                .thenReturn(List.of(dayOne, dayTwoMorning, dayTwoOpen));
        when(workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId()))
                .thenReturn(List.of(dayOne, dayTwoMorning, dayTwoOpen));

        HistoryResponse response = historyService.getHistory(
                user.getEmail(), LocalDate.of(2026, 7, 13), LocalDate.of(2026, 7, 31));

        assertThat(response.days()).hasSize(2);
        assertThat(response.days().get(0).workedMinutes()).isEqualTo(570);
        assertThat(response.days().get(0).balanceMinutes()).isEqualTo(40);
        assertThat(response.days().get(0).isComplete()).isTrue();
        assertThat(response.days().get(1).workedMinutes()).isEqualTo(240);
        assertThat(response.days().get(1).isComplete()).isFalse();
        assertThat(response.totalWorkedMinutes()).isEqualTo(810);
        assertThat(response.hourBankMinutes()).isEqualTo(40);
    }

    @Test
    void getHistory_shouldIncludeSyntheticAbsenceForPastWorkDay() {
        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        eq(user.getId()), any(), any()))
                .thenReturn(List.of());
        when(workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId())).thenReturn(List.of());

        HistoryResponse response = historyService.getHistory(
                user.getEmail(), LocalDate.of(2026, 7, 13), LocalDate.of(2026, 7, 14));

        assertThat(response.days()).hasSize(1);
        assertThat(response.days().get(0).date()).isEqualTo(LocalDate.of(2026, 7, 13));
        assertThat(response.days().get(0).workedMinutes()).isZero();
        assertThat(response.days().get(0).balanceMinutes()).isEqualTo(-530);
        assertThat(response.days().get(0).isComplete()).isTrue();
        assertThat(response.hourBankMinutes()).isEqualTo(-530);
    }

    private WorkLog closedLog(String entryAt, String exitAt) {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse(entryAt));
        workLog.close(Instant.parse(exitAt), CloseReason.EXIT);
        return workLog;
    }

    private WorkLog openLog(String entryAt) {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse(entryAt));
        return workLog;
    }
}
