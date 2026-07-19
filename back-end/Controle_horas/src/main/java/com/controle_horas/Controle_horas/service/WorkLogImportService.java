package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.ImportErrorResponse;
import com.controle_horas.Controle_horas.dto.WorkLogImportResponse;
import com.controle_horas.Controle_horas.entity.CloseReason;
import com.controle_horas.Controle_horas.entity.User;
import com.controle_horas.Controle_horas.entity.WorkLog;
import com.controle_horas.Controle_horas.exception.ForbiddenOperationException;
import com.controle_horas.Controle_horas.exception.ResourceNotFoundException;
import com.controle_horas.Controle_horas.repository.UserRepository;
import com.controle_horas.Controle_horas.repository.WorkLogRepository;
import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

@Service
public class WorkLogImportService {

    public static final String TEMPLATE_HEADER = "email,entry_at,exit_at,close_reason";
    public static final String TEMPLATE_EXAMPLE_ONE =
            "user@empresa.com,2026-07-14T08:30:00-03:00,2026-07-14T12:00:00-03:00,PAUSE";
    public static final String TEMPLATE_EXAMPLE_TWO =
            "user@empresa.com,2026-07-14T13:00:00-03:00,2026-07-14T17:20:00-03:00,EXIT";

    private final AccessControlService accessControlService;
    private final UserRepository userRepository;
    private final WorkLogRepository workLogRepository;
    private final DataFormatter dataFormatter = new DataFormatter(Locale.ROOT);

    public WorkLogImportService(
            AccessControlService accessControlService,
            UserRepository userRepository,
            WorkLogRepository workLogRepository) {
        this.accessControlService = accessControlService;
        this.userRepository = userRepository;
        this.workLogRepository = workLogRepository;
    }

    public byte[] buildCsvTemplate() {
        String content = TEMPLATE_HEADER + "\n"
                + TEMPLATE_EXAMPLE_ONE + "\n"
                + TEMPLATE_EXAMPLE_TWO + "\n";
        return content.getBytes(StandardCharsets.UTF_8);
    }

    public byte[] buildXlsxTemplate() {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream outputStream = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("work_logs");
            Row header = sheet.createRow(0);
            writeCells(header, "email", "entry_at", "exit_at", "close_reason");
            writeCells(sheet.createRow(1),
                    "user@empresa.com",
                    "2026-07-14T08:30:00-03:00",
                    "2026-07-14T12:00:00-03:00",
                    "PAUSE");
            writeCells(sheet.createRow(2),
                    "user@empresa.com",
                    "2026-07-14T13:00:00-03:00",
                    "2026-07-14T17:20:00-03:00",
                    "EXIT");
            for (int column = 0; column < 4; column++) {
                sheet.autoSizeColumn(column);
            }
            workbook.write(outputStream);
            return outputStream.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to build XLSX template", exception);
        }
    }

    @Transactional
    public WorkLogImportResponse importFile(String actorEmail, MultipartFile file) {
        User actor = accessControlService.requireActor(actorEmail);
        String filename = file.getOriginalFilename() != null ? file.getOriginalFilename().toLowerCase(Locale.ROOT) : "";

        List<ImportRow> rows;
        try {
            if (filename.endsWith(".csv")) {
                rows = parseCsv(file.getInputStream());
            } else if (filename.endsWith(".xlsx")) {
                rows = parseXlsx(file.getInputStream());
            } else {
                throw new IllegalArgumentException("Unsupported file type. Use .csv or .xlsx");
            }
        } catch (IOException exception) {
            throw new IllegalArgumentException("Unable to read uploaded file");
        }

        int importedCount = 0;
        List<ImportErrorResponse> errors = new ArrayList<>();

        for (ImportRow row : rows) {
            try {
                importRow(actor, row);
                importedCount++;
            } catch (RuntimeException exception) {
                errors.add(new ImportErrorResponse(row.rowNumber(), exception.getMessage()));
            }
        }

        return new WorkLogImportResponse(importedCount, errors.size(), errors);
    }

    private void importRow(User actor, ImportRow row) {
        if (row.email() == null || row.email().isBlank()) {
            throw new IllegalArgumentException("email is required");
        }
        if (row.entryAtRaw() == null || row.entryAtRaw().isBlank()) {
            throw new IllegalArgumentException("entry_at is required");
        }
        if (row.exitAtRaw() == null || row.exitAtRaw().isBlank()) {
            throw new IllegalArgumentException("exit_at is required");
        }

        String email = row.email().trim().toLowerCase(Locale.ROOT);
        User target = userRepository.findByEmail(email)
                .orElseThrow(() -> new ResourceNotFoundException("User not found for email: " + email));

        try {
            accessControlService.assertCanAccess(actor, target);
        } catch (ForbiddenOperationException exception) {
            throw new ForbiddenOperationException("No permission to import records for email: " + email);
        }

        Instant entryAt = parseInstant(row.entryAtRaw(), "entry_at");
        Instant exitAt = parseInstant(row.exitAtRaw(), "exit_at");
        if (exitAt.isBefore(entryAt)) {
            throw new IllegalArgumentException("exit_at must be after or equal to entry_at");
        }

        CloseReason closeReason = parseCloseReason(row.closeReasonRaw());

        if (!workLogRepository.findOverlapping(target.getId(), entryAt, exitAt).isEmpty()) {
            throw new IllegalArgumentException("Overlapping work log already exists for this period");
        }

        WorkLog workLog = new WorkLog();
        workLog.setUser(target);
        workLog.setEntryAt(entryAt);
        workLog.close(exitAt, closeReason);
        workLogRepository.save(workLog);
    }

    private CloseReason parseCloseReason(String raw) {
        if (raw == null || raw.isBlank()) {
            return CloseReason.EXIT;
        }
        try {
            return CloseReason.valueOf(raw.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException exception) {
            throw new IllegalArgumentException("close_reason must be PAUSE, LUNCH or EXIT");
        }
    }

    private Instant parseInstant(String value, String fieldName) {
        try {
            return Instant.parse(value.trim());
        } catch (DateTimeParseException exception) {
            throw new IllegalArgumentException(fieldName + " must be a valid ISO-8601 instant");
        }
    }

    private List<ImportRow> parseCsv(InputStream inputStream) throws IOException {
        List<ImportRow> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8))) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                throw new IllegalArgumentException("CSV file is empty");
            }
            validateHeader(splitCsv(headerLine));

            String line;
            int rowNumber = 1;
            while ((line = reader.readLine()) != null) {
                rowNumber++;
                if (line.isBlank()) {
                    continue;
                }
                String[] values = splitCsv(line);
                rows.add(toImportRow(rowNumber, values));
            }
        }
        return rows;
    }

    private List<ImportRow> parseXlsx(InputStream inputStream) throws IOException {
        List<ImportRow> rows = new ArrayList<>();
        try (Workbook workbook = new XSSFWorkbook(inputStream)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null || sheet.getPhysicalNumberOfRows() == 0) {
                throw new IllegalArgumentException("XLSX file is empty");
            }
            Row headerRow = sheet.getRow(0);
            validateHeader(new String[] {
                    cellValue(headerRow, 0),
                    cellValue(headerRow, 1),
                    cellValue(headerRow, 2),
                    cellValue(headerRow, 3)
            });

            for (int rowIndex = 1; rowIndex <= sheet.getLastRowNum(); rowIndex++) {
                Row row = sheet.getRow(rowIndex);
                if (row == null || isBlankRow(row)) {
                    continue;
                }
                rows.add(toImportRow(rowIndex + 1, new String[] {
                        cellValue(row, 0),
                        cellValue(row, 1),
                        cellValue(row, 2),
                        cellValue(row, 3)
                }));
            }
        }
        return rows;
    }

    private ImportRow toImportRow(int rowNumber, String[] values) {
        return new ImportRow(
                rowNumber,
                valueAt(values, 0),
                valueAt(values, 1),
                valueAt(values, 2),
                valueAt(values, 3));
    }

    private void validateHeader(String[] header) {
        if (header.length < 3
                || !"email".equalsIgnoreCase(safe(header[0]))
                || !"entry_at".equalsIgnoreCase(safe(header[1]))
                || !"exit_at".equalsIgnoreCase(safe(header[2]))) {
            throw new IllegalArgumentException("Invalid header. Expected: email,entry_at,exit_at,close_reason");
        }
    }

    private String[] splitCsv(String line) {
        return line.split(",", -1);
    }

    private String valueAt(String[] values, int index) {
        if (index >= values.length) {
            return null;
        }
        String value = values[index];
        return value != null ? value.trim() : null;
    }

    private String cellValue(Row row, int index) {
        if (row == null) {
            return "";
        }
        Cell cell = row.getCell(index);
        return cell == null ? "" : dataFormatter.formatCellValue(cell).trim();
    }

    private boolean isBlankRow(Row row) {
        for (int index = 0; index < 4; index++) {
            if (!cellValue(row, index).isBlank()) {
                return false;
            }
        }
        return true;
    }

    private void writeCells(Row row, String... values) {
        for (int index = 0; index < values.length; index++) {
            row.createCell(index).setCellValue(values[index]);
        }
    }

    private String safe(String value) {
        return value == null ? "" : value.trim();
    }

    private record ImportRow(
            int rowNumber,
            String email,
            String entryAtRaw,
            String exitAtRaw,
            String closeReasonRaw
    ) {
    }
}
