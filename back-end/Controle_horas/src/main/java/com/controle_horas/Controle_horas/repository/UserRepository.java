package com.controle_horas.Controle_horas.repository;

import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.UserRole;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, UUID> {

    Optional<User> findByEmail(String email);

    boolean existsByEmail(String email);

    boolean existsByRole(UserRole role);

    List<User> findByManagerIdOrderByNameAsc(UUID managerId);

    List<User> findByCreatedByIdOrderByNameAsc(UUID createdById);

    List<User> findAllByOrderByNameAsc();
}
