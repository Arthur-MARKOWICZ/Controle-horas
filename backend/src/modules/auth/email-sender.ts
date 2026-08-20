import nodemailer from 'nodemailer'

export interface PasswordResetEmailSender {
  sendPasswordReset(input: { recipient: string; resetUrl: string }): Promise<void>
}

export class SmtpPasswordResetEmailSender implements PasswordResetEmailSender {
  private readonly transport

  constructor(smtpUrl: string, private readonly from: string) {
    this.transport = nodemailer.createTransport(smtpUrl)
  }

  async sendPasswordReset(input: { recipient: string; resetUrl: string }): Promise<void> {
    await this.transport.sendMail({
      from: this.from,
      to: input.recipient,
      subject: 'Redefinição de senha — Controle de horas',
      text: `Recebemos uma solicitação para redefinir sua senha. Use este link em até 30 minutos:\n${input.resetUrl}\n\nSe não foi você, ignore este e-mail.`,
    })
  }
}
