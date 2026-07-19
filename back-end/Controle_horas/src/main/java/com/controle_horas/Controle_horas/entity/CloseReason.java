package com.controle_horas.Controle_horas.entity;

public enum CloseReason {
    PAUSE,
    LUNCH,
    EXIT;

    public boolean isTemporaryBreak() {
        return this == PAUSE || this == LUNCH;
    }
}
