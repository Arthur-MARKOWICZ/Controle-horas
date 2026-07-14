package com.controle_horas.Controle_horas.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.controle_horas.Controle_horas.dto.DashboardResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.exception.InvalidWorkLogStateException;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class DashboardServiceTest {

    @Mock private WorkLogRepository workLogRepository;
    @Mock private UserService userService;

    private DashboardService dashboardService;
    private User user;

    @BeforeEach
    void setUp() {
        Clock clock = Clock.fixed(Instant.parse("2026-07-14T12:00:00Z"), ZoneOffset.UTC);
        dashboardService = new DashboardService(
                workLogRepository, userService, new WorkTimeCalculationService(), clock);
        user = new User();
        user.setId(UUID.randomUUID());
        user.setEmail("arthur@example.com");
        user.setDailyWorkloadMinutes(530);
    }

    @Test
    void registerEntry_shouldCreateOpenWorkLog() {
        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()))
                .thenReturn(Optional.empty(), Optional.of(new WorkLog()));
        when(workLogRepository.findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        eq(user.getId()), any(), any()))
                .thenReturn(List.of());
        when(workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId())).thenReturn(List.of());

        DashboardResponse response = dashboardService.registerEntry(user.getEmail());

        ArgumentCaptor<WorkLog> captor = ArgumentCaptor.forClass(WorkLog.class);
        verify(workLogRepository).save(captor.capture());
        assertThat(captor.getValue().getUser()).isEqualTo(user);
        assertThat(captor.getValue().getEntryAt()).isEqualTo(Instant.parse("2026-07-14T12:00:00Z"));
        assertThat(response.nextAction()).isEqualTo("EXIT");
    }

    @Test
    void registerEntry_shouldRejectWhenThereIsAnOpenWorkLog() {
        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()))
                .thenReturn(Optional.of(new WorkLog()));

        assertThatThrownBy(() -> dashboardService.registerEntry(user.getEmail()))
                .isInstanceOf(InvalidWorkLogStateException.class);
    }

    @Test
    void registerExit_shouldCloseOpenWorkLog() {
        WorkLog workLog = new WorkLog();
        workLog.setEntryAt(Instant.parse("2026-07-14T08:00:00Z"));
        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()))
                .thenReturn(Optional.of(workLog), Optional.empty());
        when(workLogRepository.findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        eq(user.getId()), any(), any()))
                .thenReturn(List.of(workLog));
        when(workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId())).thenReturn(List.of(workLog));

        DashboardResponse response = dashboardService.registerExit(user.getEmail());

        assertThat(workLog.getExitAt()).isEqualTo(Instant.parse("2026-07-14T12:00:00Z"));
        assertThat(response.nextAction()).isEqualTo("ENTRY");
    }

    @Test
    void registerExit_shouldRejectWhenThereIsNoOpenWorkLog() {
        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> dashboardService.registerExit(user.getEmail()))
                .isInstanceOf(InvalidWorkLogStateException.class);
    }

    @Test
    void getToday_shouldReturnExpectedExitAndBalances() {
        WorkLog morning = new WorkLog();
        morning.setEntryAt(Instant.parse("2026-07-14T11:30:00Z"));
        morning.setExitAt(Instant.parse("2026-07-14T15:30:00Z"));
        WorkLog afternoon = new WorkLog();
        afternoon.setEntryAt(Instant.parse("2026-07-14T16:30:00Z"));
        afternoon.setExitAt(Instant.parse("2026-07-14T20:00:00Z"));

        when(userService.findUser(user.getEmail())).thenReturn(user);
        when(workLogRepository.findByUserIdAndEntryAtGreaterThanEqualAndEntryAtLessThanOrderByEntryAtAsc(
                        eq(user.getId()), any(), any()))
                .thenReturn(List.of(morning, afternoon));
        when(workLogRepository.findByUserIdOrderByEntryAtAsc(user.getId()))
                .thenReturn(List.of(morning, afternoon));
        when(workLogRepository.findTopByUserIdAndExitAtIsNullOrderByEntryAtDesc(user.getId()))
                .thenReturn(Optional.empty());

        DashboardResponse response = dashboardService.getToday(user.getEmail());

        assertThat(response.expectedExitAt()).isEqualTo(Instant.parse("2026-07-14T20:20:00Z"));
        assertThat(response.workedMinutesToday()).isEqualTo(450);
        assertThat(response.balanceMinutesToday()).isEqualTo(-80);
        assertThat(response.hourBankMinutes()).isEqualTo(-80);
        assertThat(response.nextAction()).isEqualTo("ENTRY");
    }
}
