package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.time.LocalDate;
import org.springframework.stereotype.Service;

@Service
public class WorkStartDateService {

    private final WorkLogRepository workLogRepository;
    private final WorkTimeCalculationService workTimeCalculationService;

    public WorkStartDateService(
            WorkLogRepository workLogRepository,
            WorkTimeCalculationService workTimeCalculationService) {
        this.workLogRepository = workLogRepository;
        this.workTimeCalculationService = workTimeCalculationService;
    }

    public LocalDate resolveStartDate(User user) {
        if (user == null) {
            return null;
        }
        if (user.getWorkStartDate() != null) {
            return user.getWorkStartDate();
        }
        return workLogRepository.findTopByUserIdOrderByEntryAtAsc(user.getId())
                .map(WorkLog::getEntryAt)
                .map(workTimeCalculationService::toDisplayDate)
                .orElse(null);
    }
}

