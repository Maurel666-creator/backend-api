import { prisma } from '@/lib/prisma';

export enum ActionType {
    USER_UPDATE = "USER_UPDATE",
    USER_ROLE_CHANGE = "USER_ROLE_CHANGE",
    USER_PASSWORD_CHANGE = "USER_PASSWORD_CHANGE",
    USER_DELETE = "USER_DELETE",
    LIBRARY_CREATE = "LIBRARY_CREATE",
    LIBRARY_UPDATE = "LIBRARY_UPDATE",
    LIBRARY_DELETE = "LIBRARY_DELETE",
    MANAGER_ASSIGNED = "MANAGER_ASSIGNED",
    MANAGER_REMOVED = "MANAGER_REMOVED",
    BOOK_CREATED = "BOOK_CREATED",
    BOOK_UPDATED = "BOOK_UPDATED",
    BOOK_DELETED = "BOOK_DELETED"
}

export async function logAction(
    actionType: ActionType,
    userId: number,
    details: Record<string, unknown> = {}
) {
    try {
        await prisma.actionLog.create({
            data: {
                userId,
                action: actionType,
                details: JSON.stringify(details)
            }
        });
    } catch (error) {
        console.error('Failed to log action:', error);
    }
}