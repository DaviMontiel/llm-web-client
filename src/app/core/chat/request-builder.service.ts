import { Injectable, inject } from '@angular/core';
import { I18nService } from '../i18n/i18n.service';
import { AppError, Attachment, Chat, ChatMessage, ContextSummary, LLMModel, Message, Project } from '../models';
import { ProjectService } from '../projects/project.service';
import { SettingsService } from '../settings/settings.service';
import { formatBytes } from '../utils/format';

export interface BuiltRequest {
  system: string;
  messages: ChatMessage[];
  context: ContextSummary;
}

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/** Serializa los adjuntos de texto/binarios de un mensaje de usuario. */
export function renderAttachmentsForModel(attachments: readonly Attachment[], visionEnabled: boolean): string {
  const blocks: string[] = [];
  for (const a of attachments) {
    const label = escapeAttr(a.path ?? a.name);
    if (a.kind === 'text' && a.textContent !== undefined) {
      blocks.push(
        `<attachment name="${label}"${a.truncated ? ' truncated="true"' : ''}>\n${a.textContent}\n</attachment>`,
      );
    } else if (a.kind === 'image') {
      if (!visionEnabled)
        blocks.push(`<attachment name="${label}" type="image" note="omitted: model without vision support" />`);
    } else {
      blocks.push(
        `<attachment name="${label}" type="${escapeAttr(a.mimeType)}" size="${a.size}" note="binary content not included" />`,
      );
    }
  }
  return blocks.join('\n\n');
}

export function toChatMessage(message: Message, model: LLMModel): ChatMessage {
  if (message.role === 'assistant') return { role: 'assistant', content: message.content };
  const vision = model.capabilities.vision;
  const attachmentsText = renderAttachmentsForModel(message.attachments, vision);
  const images = vision
    ? message.attachments
        .filter((a) => a.kind === 'image' && a.dataBase64)
        .map((a) => ({ name: a.name, mimeType: a.mimeType, dataBase64: a.dataBase64 }))
    : [];
  const content = attachmentsText ? `${message.content}\n\n${attachmentsText}`.trim() : message.content;
  return { role: 'user', content, images: images.length ? images : undefined };
}

/**
 * Construye el system prompt (instrucciones globales + proyecto + archivos
 * seleccionados) y la lista de mensajes. Solo se leen los archivos que el
 * usuario ha incluido explícitamente en el contexto del chat.
 */
@Injectable({ providedIn: 'root' })
export class RequestBuilderService {
  private readonly projects = inject(ProjectService);
  private readonly settings = inject(SettingsService);
  private readonly i18n = inject(I18nService);

  async build(chat: Chat, path: readonly Message[], model: LLMModel): Promise<BuiltRequest> {
    const settings = this.settings.settings();
    const limitBytes = settings.maxContextKB * 1024;
    const systemParts: string[] = [];
    if (settings.systemPrompt.trim()) systemParts.push(settings.systemPrompt.trim());

    const summary: ContextSummary = { files: [], instructions: false, totalBytes: 0 };
    const project = this.projects.get(chat.projectId);
    if (project) {
      systemParts.push(await this.projectBlock(project, chat, summary, limitBytes));
    }

    const messages = path
      .filter((m) => !(m.role === 'assistant' && (m.status === 'error' || !m.content.trim())))
      .map((m) => toChatMessage(m, model));

    const attachmentBytes = path
      .flatMap((m) => m.attachments)
      .reduce((sum, a) => sum + (a.kind === 'text' ? (a.textContent?.length ?? 0) : 0), 0);
    if (summary.totalBytes + attachmentBytes > limitBytes) {
      throw new AppError(
        'too_large',
        this.i18n.t('error.contextTooLarge', {
          used: formatBytes(summary.totalBytes + attachmentBytes),
          max: formatBytes(limitBytes),
        }),
      );
    }
    return { system: systemParts.filter(Boolean).join('\n\n'), messages, context: summary };
  }

  private async projectBlock(
    project: Project,
    chat: Chat,
    summary: ContextSummary,
    limitBytes: number,
  ): Promise<string> {
    const lines: string[] = [
      `<project name="${escapeAttr(project.name)}"${project.rootName ? ` root="${escapeAttr(project.rootName)}"` : ''}>`,
    ];
    if (chat.context.includeInstructions && project.instructions.trim()) {
      lines.push(`<instructions>\n${project.instructions.trim()}\n</instructions>`);
      summary.instructions = true;
      summary.totalBytes += project.instructions.length;
    }
    if (chat.context.files.length > 0) {
      if (!this.projects.canRead(project.id)) {
        throw new AppError('permission', this.i18n.t('error.projectAccessRequired', { name: project.name }), {
          localized: true,
        });
      }
      for (const path of chat.context.files) {
        const remaining = limitBytes - summary.totalBytes;
        if (remaining <= 0) {
          throw new AppError(
            'too_large',
            this.i18n.t('error.contextTooLarge', {
              used: formatBytes(summary.totalBytes),
              max: formatBytes(limitBytes),
            }),
            { localized: true },
          );
        }
        let content;
        try {
          content = await this.projects.readFile(project.id, path, remaining + 1);
        } catch (error) {
          if (error instanceof AppError && error.code === 'not_found') {
            throw new AppError('not_found', this.i18n.t('error.contextFileMissing', { path }), { localized: true });
          }
          throw error;
        }
        if (content.binary) {
          lines.push(`<file path="${escapeAttr(path)}" note="binary content not included" />`);
          continue;
        }
        const text = content.text ?? '';
        if (content.truncated || text.length > remaining) {
          throw new AppError(
            'too_large',
            this.i18n.t('error.contextTooLarge', {
              used: formatBytes(summary.totalBytes + content.size),
              max: formatBytes(limitBytes),
            }),
            { localized: true },
          );
        }
        lines.push(`<file path="${escapeAttr(path)}">\n${text}\n</file>`);
        summary.files.push({ path, bytes: text.length });
        summary.totalBytes += text.length;
      }
    }
    lines.push('</project>');
    return lines.length > 2 ? lines.join('\n') : '';
  }
}
