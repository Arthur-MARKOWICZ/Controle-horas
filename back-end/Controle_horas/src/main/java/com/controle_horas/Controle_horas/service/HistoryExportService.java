package com.controle_horas.Controle_horas.service;

import com.controle_horas.Controle_horas.dto.HistoryDayResponse;
import com.controle_horas.Controle_horas.dto.HistoryResponse;
import com.controle_horas.Controle_horas.entity.User;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.FontFactory;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.pdf.PdfPCell;
import com.lowagie.text.pdf.PdfPTable;
import com.lowagie.text.pdf.PdfWriter;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class HistoryExportService {

    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("dd/MM/yyyy");
    private static final DateTimeFormatter DATE_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm").withZone(WorkTimeCalculationService.DISPLAY_ZONE);

    private final HistoryService historyService;
    private final UserService userService;

    public HistoryExportService(HistoryService historyService, UserService userService) {
        this.historyService = historyService;
        this.userService = userService;
    }

    @Transactional(readOnly = true)
    public byte[] exportExcel(String email, LocalDate startDate, LocalDate endDate) {
        User user = userService.findUser(email);
        HistoryResponse history = historyService.getHistory(email, startDate, endDate);

        try (XSSFWorkbook workbook = new XSSFWorkbook(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet("Historico");

            int rowIndex = 0;
            rowIndex = writeExcelHeader(sheet, rowIndex, user, history);
            rowIndex = writeExcelSummary(sheet, rowIndex, history);
            writeExcelDays(sheet, rowIndex + 1, history);

            for (int column = 0; column < 6; column++) {
                sheet.autoSizeColumn(column);
            }

            workbook.write(output);
            return output.toByteArray();
        } catch (IOException exception) {
            throw new IllegalStateException("Unable to generate Excel export", exception);
        }
    }

    @Transactional(readOnly = true)
    public byte[] exportPdf(String email, LocalDate startDate, LocalDate endDate) {
        User user = userService.findUser(email);
        HistoryResponse history = historyService.getHistory(email, startDate, endDate);
        ByteArrayOutputStream output = new ByteArrayOutputStream();

        try {
            Document document = new Document();
            PdfWriter.getInstance(document, output);
            document.open();

            Font titleFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 16);
            Font sectionFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 12);
            Font bodyFont = FontFactory.getFont(FontFactory.HELVETICA, 10);

            document.add(new Paragraph("Historico de horas", titleFont));
            document.add(new Paragraph("Usuario: " + user.getName() + " (" + user.getEmail() + ")", bodyFont));
            document.add(new Paragraph(
                    "Periodo: " + formatDate(history.startDate()) + " a " + formatDate(history.endDate()),
                    bodyFont));
            document.add(new Paragraph(" "));

            document.add(new Paragraph("Resumo", sectionFont));
            document.add(new Paragraph("Horas trabalhadas: " + formatDuration(history.totalWorkedMinutes()), bodyFont));
            document.add(new Paragraph("Saldo do periodo: " + formatSignedDuration(history.totalBalanceMinutes()), bodyFont));
            document.add(new Paragraph("Banco de horas: " + formatSignedDuration(history.hourBankMinutes()), bodyFont));
            document.add(new Paragraph(" "));

            document.add(new Paragraph("Dias do periodo", sectionFont));
            document.add(buildPdfDaysTable(history));

            document.close();
            return output.toByteArray();
        } catch (DocumentException exception) {
            throw new IllegalStateException("Unable to generate PDF export", exception);
        }
    }

    private int writeExcelHeader(Sheet sheet, int rowIndex, User user, HistoryResponse history) {
        Row title = sheet.createRow(rowIndex++);
        title.createCell(0).setCellValue("Historico de horas");

        Row userRow = sheet.createRow(rowIndex++);
        userRow.createCell(0).setCellValue("Usuario");
        userRow.createCell(1).setCellValue(user.getName() + " (" + user.getEmail() + ")");

        Row periodRow = sheet.createRow(rowIndex++);
        periodRow.createCell(0).setCellValue("Periodo");
        periodRow.createCell(1).setCellValue(formatDate(history.startDate()) + " a " + formatDate(history.endDate()));

        return rowIndex + 1;
    }

    private int writeExcelSummary(Sheet sheet, int rowIndex, HistoryResponse history) {
        Row summaryTitle = sheet.createRow(rowIndex++);
        summaryTitle.createCell(0).setCellValue("Resumo");

        Row worked = sheet.createRow(rowIndex++);
        worked.createCell(0).setCellValue("Horas trabalhadas");
        worked.createCell(1).setCellValue(formatDuration(history.totalWorkedMinutes()));

        Row balance = sheet.createRow(rowIndex++);
        balance.createCell(0).setCellValue("Saldo do periodo");
        balance.createCell(1).setCellValue(formatSignedDuration(history.totalBalanceMinutes()));

        Row hourBank = sheet.createRow(rowIndex++);
        hourBank.createCell(0).setCellValue("Banco de horas");
        hourBank.createCell(1).setCellValue(formatSignedDuration(history.hourBankMinutes()));

        return rowIndex;
    }

    private void writeExcelDays(Sheet sheet, int startRow, HistoryResponse history) {
        int rowIndex = startRow;
        Row header = sheet.createRow(rowIndex++);
        header.createCell(0).setCellValue("Data");
        header.createCell(1).setCellValue("Primeira entrada");
        header.createCell(2).setCellValue("Ultima saida");
        header.createCell(3).setCellValue("Horas trabalhadas");
        header.createCell(4).setCellValue("Saldo");
        header.createCell(5).setCellValue("Status");

        for (HistoryDayResponse day : history.days()) {
            Row row = sheet.createRow(rowIndex++);
            row.createCell(0).setCellValue(formatDate(day.date()));
            row.createCell(1).setCellValue(formatInstant(day.firstEntryAt()));
            row.createCell(2).setCellValue(formatInstant(day.lastExitAt()));
            row.createCell(3).setCellValue(formatDuration(day.workedMinutes()));
            row.createCell(4).setCellValue(formatSignedDuration(day.balanceMinutes()));
            row.createCell(5).setCellValue(day.isComplete() ? "Completo" : "Em andamento");
        }
    }

    private PdfPTable buildPdfDaysTable(HistoryResponse history) throws DocumentException {
        PdfPTable table = new PdfPTable(6);
        table.setWidthPercentage(100);
        table.setWidths(new float[] {2f, 3f, 3f, 2.5f, 2f, 2.5f});

        addPdfHeaderCell(table, "Data");
        addPdfHeaderCell(table, "Primeira entrada");
        addPdfHeaderCell(table, "Ultima saida");
        addPdfHeaderCell(table, "Horas trabalhadas");
        addPdfHeaderCell(table, "Saldo");
        addPdfHeaderCell(table, "Status");

        Font bodyFont = FontFactory.getFont(FontFactory.HELVETICA, 9);
        for (HistoryDayResponse day : history.days()) {
            addPdfBodyCell(table, formatDate(day.date()), bodyFont);
            addPdfBodyCell(table, formatInstant(day.firstEntryAt()), bodyFont);
            addPdfBodyCell(table, formatInstant(day.lastExitAt()), bodyFont);
            addPdfBodyCell(table, formatDuration(day.workedMinutes()), bodyFont);
            addPdfBodyCell(table, formatSignedDuration(day.balanceMinutes()), bodyFont);
            addPdfBodyCell(table, day.isComplete() ? "Completo" : "Em andamento", bodyFont);
        }
        return table;
    }

    private void addPdfHeaderCell(PdfPTable table, String text) {
        Font headerFont = FontFactory.getFont(FontFactory.HELVETICA_BOLD, 9, Color.WHITE);
        PdfPCell cell = new PdfPCell(new Phrase(text, headerFont));
        cell.setBackgroundColor(new Color(31, 111, 91));
        cell.setHorizontalAlignment(Element.ALIGN_CENTER);
        cell.setPadding(5f);
        table.addCell(cell);
    }

    private void addPdfBodyCell(PdfPTable table, String text, Font font) {
        PdfPCell cell = new PdfPCell(new Phrase(text, font));
        cell.setPadding(4f);
        table.addCell(cell);
    }

    private String formatDate(LocalDate date) {
        return date == null ? "-" : DATE_FORMATTER.format(date);
    }

    private String formatInstant(Instant instant) {
        return instant == null ? "-" : DATE_TIME_FORMATTER.format(instant);
    }

    private String formatDuration(int totalMinutes) {
        Duration duration = Duration.ofMinutes(Math.abs(totalMinutes));
        long hours = duration.toHours();
        long minutes = duration.toMinutesPart();
        return hours + "h " + String.format("%02d", minutes) + "m";
    }

    private String formatSignedDuration(int totalMinutes) {
        String sign = totalMinutes > 0 ? "+" : (totalMinutes < 0 ? "-" : "");
        return sign + formatDuration(totalMinutes);
    }
}
