import nodemailer from 'nodemailer';

// For development, we'll use Ethereal Email (fake SMTP service)
// In production, you would use your actual email provider (Gmail, SendGrid, etc.)
let transporter: nodemailer.Transporter | null = null;

async function getTransporter() {
  if (!transporter) {
    // Check if we have email configuration from environment
    if (process.env.SMTP_HOST && process.env.SMTP_PORT && process.env.SMTP_USER && process.env.SMTP_PASS) {
      transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });
    } else {
      // For development, create an Ethereal test account
      const testAccount = await nodemailer.createTestAccount();
      transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
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

export async function sendEmployeeCredentialsEmail(
  employeeEmail: string,
  employeeName: string,
  password: string,
  workstationNames: string[]
) {
  try {
    const transporter = await getTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@taskflow.local',
      to: employeeEmail,
      subject: 'Welcome to TaskFlow - Your Account Credentials',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0066cc; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Welcome to TaskFlow</h1>
          </div>
          <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p>Hi ${employeeName},</p>
            <p>Your manager has created a TaskFlow account for you. Here are your login credentials:</p>

            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <p style="margin: 5px 0;"><strong>Email:</strong> ${employeeEmail}</p>
              <p style="margin: 5px 0;"><strong>Password:</strong> ${password}</p>
            </div>

            <p><strong>Assigned Workstations:</strong></p>
            <ul>
              ${workstationNames.map((ws) => `<li>${ws}</li>`).join('')}
            </ul>

            <p>You can now log in to your account and start managing your daily tasks. Here's what you need to do:</p>
            <ol>
              <li>Visit the TaskFlow application</li>
              <li>Click "Sign in"</li>
              <li>Enter your email and password above</li>
              <li>You'll see your assigned tasks for each workstation</li>
            </ol>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent:', info.messageId);

    // For test accounts, log the preview URL
    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export async function sendTaskAssignmentEmail(
  employeeEmail: string,
  employeeName: string,
  taskTitle: string,
  taskDescription?: string
) {
  try {
    const transporter = await getTransporter();

    const mailOptions = {
      from: process.env.EMAIL_FROM || 'noreply@taskflow.local',
      to: employeeEmail,
      subject: 'New Task Assigned in TaskFlow',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #0066cc; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">New Task Assigned</h1>
          </div>
          <div style="border: 1px solid #ddd; border-top: none; padding: 20px; border-radius: 0 0 8px 8px;">
            <p>Hi ${employeeName},</p>
            <p>You have been assigned a new task:</p>

            <div style="background-color: #f5f5f5; padding: 15px; border-radius: 4px; margin: 20px 0;">
              <h3 style="margin: 0 0 10px 0; color: #0066cc;">${taskTitle}</h3>
              ${taskDescription ? `<p style="margin: 0; color: #666;">${taskDescription}</p>` : ''}
            </div>

            <p>Please log in to your TaskFlow dashboard to view and complete this task.</p>

            <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #ddd; font-size: 12px; color: #666;">
              This is an automated message. Please do not reply to this email.
            </p>
          </div>
        </div>
      `,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Task assignment email sent:', info.messageId);

    // For test accounts, log the preview URL
    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send task assignment email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

export default async function sendEmail(
  to: string,
  subject: string,
  text: string
) {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || 'noreply@taskflow.local',
      to,
      subject,
      text,
    });

    console.log('Email sent:', info.messageId);

    if (process.env.NODE_ENV !== 'production' && !process.env.SMTP_HOST) {
      console.log('Preview URL:', nodemailer.getTestMessageUrl(info));
    }

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Failed to send email:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
