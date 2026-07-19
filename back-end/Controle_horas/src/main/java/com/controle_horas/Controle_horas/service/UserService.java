package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.CurrentUserResponse;
import com.controle_horas.Controle_horas.dto.DailyWorkloadResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.repository.UserRepository;
import com.controle_horas.Controle_horas.util.WorkDaysConverter;
import java.time.DayOfWeek;
import java.time.LocalTime;
import java.util.Set;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {

    private final UserRepository userRepository;

    public UserService(UserRepository userRepository) {
        this.userRepository = userRepository;
    }

    @Transactional(readOnly = true)
    public CurrentUserResponse getCurrentUser(String email) {
        User user = findUser(email);
        return new CurrentUserResponse(
                user.getId(),
                user.getName(),
                user.getEmail(),
                user.getRole().name());
    }

    @Transactional
    public DailyWorkloadResponse updateDailyWorkload(
            String email,
            LocalTime standardEntryTime,
            LocalTime standardExitTime,
            boolean lunchEnabled,
            int lunchDurationMinutes,
            Set<DayOfWeek> workDays) {
        if (!standardExitTime.isAfter(standardEntryTime)) {
            throw new IllegalArgumentException("Standard exit time must be after standard entry time");
        }
        Set<DayOfWeek> normalizedWorkDays = WorkDaysConverter.normalize(workDays);
        User user = findUser(email);
        user.updateWorkSchedule(
                standardEntryTime,
                standardExitTime,
                lunchEnabled,
                lunchDurationMinutes,
                normalizedWorkDays);
        return new DailyWorkloadResponse(
                user.getDailyWorkloadMinutes(),
                user.getStandardEntryTime(),
                user.getStandardExitTime(),
                user.isLunchEnabled(),
                user.getLunchDurationMinutes(),
                user.getWorkDays());
    }

    @Transactional(readOnly = true)
    public User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
    }
}
