package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.DailyWorkloadResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.repository.UserRepository;
import java.time.LocalTime;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class UserService {
    private final UserRepository userRepository;
    public UserService(UserRepository userRepository) { this.userRepository = userRepository; }

    @Transactional
    public DailyWorkloadResponse updateDailyWorkload(String email, LocalTime standardEntryTime, LocalTime standardExitTime) {
        if (!standardExitTime.isAfter(standardEntryTime)) {
            throw new IllegalArgumentException("Standard exit time must be after standard entry time");
        }
        User user = findUser(email);
        user.updateWorkSchedule(standardEntryTime, standardExitTime);
        return new DailyWorkloadResponse(
                user.getDailyWorkloadMinutes(),
                user.getStandardEntryTime(),
                user.getStandardExitTime());
    }

    @Transactional(readOnly = true)
    public User findUser(String email) {
        return userRepository.findByEmail(email)
                .orElseThrow(() -> new UsernameNotFoundException("User not found"));
    }
}
