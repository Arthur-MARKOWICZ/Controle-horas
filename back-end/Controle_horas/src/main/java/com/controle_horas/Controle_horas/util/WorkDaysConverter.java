package com.controle_horas.Controle_horas.util;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import java.time.DayOfWeek;
import java.util.Arrays;
import java.util.Collection;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.stream.Collectors;

@Converter
public class WorkDaysConverter implements AttributeConverter<Set<DayOfWeek>, String> {

    public static final Set<DayOfWeek> DEFAULT_WORK_DAYS = EnumSet.of(
            DayOfWeek.MONDAY,
            DayOfWeek.TUESDAY,
            DayOfWeek.WEDNESDAY,
            DayOfWeek.THURSDAY,
            DayOfWeek.FRIDAY);

    @Override
    public String convertToDatabaseColumn(Set<DayOfWeek> attribute) {
        Set<DayOfWeek> workDays = normalize(attribute);
        return workDays.stream()
                .sorted()
                .map(DayOfWeek::name)
                .collect(Collectors.joining(","));
    }

    @Override
    public Set<DayOfWeek> convertToEntityAttribute(String databaseValue) {
        if (databaseValue == null || databaseValue.isBlank()) {
            return EnumSet.copyOf(DEFAULT_WORK_DAYS);
        }
        return Arrays.stream(databaseValue.split(","))
                .map(String::trim)
                .filter(value -> !value.isEmpty())
                .map(DayOfWeek::valueOf)
                .collect(Collectors.toCollection(() -> EnumSet.noneOf(DayOfWeek.class)));
    }

    public static Set<DayOfWeek> normalize(Collection<DayOfWeek> workDays) {
        if (workDays == null || workDays.isEmpty()) {
            throw new IllegalArgumentException("At least one work day must be selected");
        }
        return EnumSet.copyOf(new LinkedHashSet<>(workDays));
    }

    public static Set<DayOfWeek> defaultWorkDays() {
        return EnumSet.copyOf(DEFAULT_WORK_DAYS);
    }
}
