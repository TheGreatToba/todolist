import nodemailer from "nodemailer";
import { logger } from "./logger";

/** Escape user-provided content to prevent XSS in HTML emails */
function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// For development, we'll use Ethereal Email (fake SMTP service)
// In production, you would use your actual email provider (Gmail, SendGrid, etc.)
let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (!transporter) {
    // Check if we have email configuration from environment
    if (
      process.env.SMTP_HOST &&
      process.env.SMTP_PORT &&
      process.env.SMTP_USER &&
      process.env.SMTP_PASS
    ) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === "true", // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // For development, create an Ethereal test account
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass,
        },
      });
    }
  }

  return transporter;
}

/** Send welcome email with a link to set password (no password in email) */
export async function sendSetPasswordEmail(
  employeeEmail: string,
  employeeName: string,
  setPasswordLink: string,
  workstationNames: string[],
  expiryHours: number = 24,
) {
  try {
    const transporter = await getTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@tastycrousty.local",
      to: employeeEmail,
      subject: "Welcome to Tasty Crousty - Set Your Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #e91e8c; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Welcome to Tasty Crousty</h1>
          </div>
          <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p>Hi ${escapeHtml(employeeName)},</p>
            <p>Your manager has created a Tasty Crousty account for you. Click the button below to set your password and activate your account:</p>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${escapeHtml(setPasswordLink)}" style="display: inline-block; padding: 12px 24px; background-color: #e91e8c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Set my password</a>
            </div>

            <p style="font-size: 13px; color: #666;">Or copy this link into your browser:</p>
            <p style="font-size: 12px; word-break: break-all; color: #666;">${escapeHtml(setPasswordLink)}</p>

            <p><strong>Assigned Workstations:</strong></p>
            <ul>
              ${workstationNames.map((ws) => `<li>${escapeHtml(ws)}</li>`).join("")}
            </ul>

            <div style="background-color: #e8f5e9; border: 1px solid #4caf50; padding: 12px; border-radius: 4px; margin: 16px 0; font-size: 13px;">
              <strong>Security:</strong> This link expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"} and can only be used once. Do not share it with anyone.
            </div>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info("Set password email sent:", info.messageId);

    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      logger.debug("Preview URL:", nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Failed to send set password email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function sendTaskAssignmentEmail(
  employeeEmail: string,
  employeeName: string,
  taskTitle: string,
  taskDescription?: string,
) {
  try {
    const transporter = await getTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@tastycrousty.local",
      to: employeeEmail,
      subject: "New Task Assigned in Tasty Crousty",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #e91e8c; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">New Task Assigned</h1>
          </div>
          <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p>Hi ${escapeHtml(employeeName)},</p>
            <p>You have been assigned a new task:</p>

            <div style="background-color: #fce4ec; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #e91e8c;">${escapeHtml(taskTitle)}</h3>
              ${taskDescription ? `<p style="margin: 0; color: #666;">${escapeHtml(taskDescription)}</p>` : ""}
            </div>

            <p>Please log in to your Tasty Crousty dashboard to view and complete this task.</p>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info("Task assignment email sent:", info.messageId);

    // For test accounts, log the preview URL
    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      logger.debug("Preview URL:", nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Failed to send task assignment email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/** Send password reset email with a link to reset password */
export async function sendPasswordResetEmail(
  userEmail: string,
  userName: string,
  resetLink: string,
  expiryHours: number = 1,
) {
  try {
    const transporter = await getTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || "noreply@tastycrousty.local",
      to: userEmail,
      subject: "Tasty Crousty - Reset Your Password",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #e91e8c; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Password Reset Request</h1>
          </div>
          <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p>Hi ${escapeHtml(userName)},</p>
            <p>We received a request to reset your password for your Tasty Crousty account. Click the button below to reset your password:</p>

            <div style="text-align: center; margin: 24px 0;">
              <a href="${escapeHtml(resetLink)}" style="display: inline-block; padding: 12px 24px; background-color: #e91e8c; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">Reset my password</a>
            </div>

            <p style="font-size: 13px; color: #666;">Or copy this link into your browser:</p>
            <p style="font-size: 12px; word-break: break-all; color: #666;">${escapeHtml(resetLink)}</p>

            <div style="background-color: #fff3cd; border: 1px solid #ffc107; padding: 12px; border-radius: 4px; margin: 16px 0; font-size: 13px;">
              <strong>Security:</strong> This link expires in ${expiryHours} hour${expiryHours === 1 ? "" : "s"} and can only be used once. If you didn't request this, please ignore this email and your password will remain unchanged.
            </div>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    logger.info("Password reset email sent:", info.messageId);

    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      logger.debug("Preview URL:", nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Failed to send password reset email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export default async function sendEmail(
  to: string,
  subject: string,
  text: string,
) {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || "noreply@tastycrousty.local",
      to,
      subject,
      text,
    });

    logger.info("Email sent:", info.messageId);

    if (process.env.NODE_ENV !== "production" && !process.env.SMTP_HOST) {
      logger.debug("Preview URL:", nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    logger.error("Failed to send email:", error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
