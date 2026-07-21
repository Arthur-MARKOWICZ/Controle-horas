package com.controle_horas.Controle_horas.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.security")
public class SecurityProperties {

    private boolean hstsEnabled;

    public boolean isHstsEnabled() {
        return hstsEnabled;
    }

    public void setHstsEnabled(boolean hstsEnabled) {
        this.hstsEnabled = hstsEnabled;
    }
}
