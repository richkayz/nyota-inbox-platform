// TanStack Query hooks over the typed MailClient. All screens read live server
// state through these hooks and mutations perform optimistic updates.

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { mailClient } from "./client";
import type {
  Contact,
  FolderSummary,
  MessageDetail,
  MessageListItem,
  Page,
  SendMessageInput,
} from "./types";

export const mailKeys = {
  folders: ["folders"] as const,
  messages: (folder: string, q?: string) => ["messages", folder, q ?? ""] as const,
  message: (folder: string, uid: number) => ["message", folder, uid] as const,
  contacts: (q?: string) => ["contacts", q ?? ""] as const,
};

const PAGE_SIZE = 30;

export function useFolders() {
  return useQuery({
    queryKey: mailKeys.folders,
    queryFn: () => mailClient.listFolders(),
    staleTime: 15_000,
  });
}

export function useMessagesInfinite(folder: string, q?: string) {
  return useInfiniteQuery({
    queryKey: mailKeys.messages(folder, q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) =>
      mailClient.listMessages({ folder, cursor: pageParam, limit: PAGE_SIZE, q }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 10_000,
  });
}

export function useMessage(folder: string | null, uid: number | null) {
  return useQuery({
    queryKey: folder && uid ? mailKeys.message(folder, uid) : ["message", "none"],
    queryFn: () => mailClient.getMessage(folder!, uid!),
    enabled: !!folder && !!uid,
    staleTime: 60_000,
  });
}

// ------- helpers to optimistically patch every cached page -------

type Patch = (m: MessageListItem) => MessageListItem | null;

function walkMessageCaches(qc: QueryClient, patch: Patch) {
  const caches = qc.getQueriesData<{ pages: Page<MessageListItem>[]; pageParams: unknown[] }>({
    queryKey: ["messages"],
  });
  for (const [key, data] of caches) {
    if (!data) continue;
    qc.setQueryData(key, {
      ...data,
      pages: data.pages.map((page) => ({
        ...page,
        items: page.items
          .map((m) => patch(m))
          .filter((m): m is MessageListItem => m !== null),
      })),
    });
  }
}

function invalidateMailCaches(qc: QueryClient) {
  qc.invalidateQueries({ queryKey: ["messages"] });
  qc.invalidateQueries({ queryKey: mailKeys.folders });
}

// ------- mutations -------

export function useSetFlags() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { folder: string; uid: number; add?: string[]; remove?: string[] }) =>
      mailClient.setFlags(v.folder, v.uid, v.add ?? [], v.remove ?? []),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      const seen = v.add?.includes("\\Seen") ? false : v.remove?.includes("\\Seen") ? true : undefined;
      const starred = v.add?.includes("\\Flagged") ? true : v.remove?.includes("\\Flagged") ? false : undefined;
      walkMessageCaches(qc, (m) =>
        m.uid === v.uid
          ? {
              ...m,
              ...(seen !== undefined ? { unread: seen } : {}),
              ...(starred !== undefined ? { starred } : {}),
            }
          : m,
      );
      // also patch detail cache
      const detailKey = mailKeys.message(v.folder, v.uid);
      const prev = qc.getQueryData<MessageDetail>(detailKey);
      if (prev) {
        qc.setQueryData<MessageDetail>(detailKey, {
          ...prev,
          ...(seen !== undefined ? { unread: seen } : {}),
          ...(starred !== undefined ? { starred } : {}),
        });
      }
    },
    onError: () => invalidateMailCaches(qc),
    onSettled: () => invalidateMailCaches(qc),
  });
}

export function useMove() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { folder: string; uid: number; target: string }) =>
      mailClient.move(v.folder, v.uid, v.target),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      // Remove from source folder's cached pages.
      walkMessageCaches(qc, (m) => (m.uid === v.uid && m.folder === v.folder ? null : m));
    },
    onError: () => invalidateMailCaches(qc),
    onSettled: () => invalidateMailCaches(qc),
  });
}

export function useRemoveMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { folder: string; uid: number }) => mailClient.remove(v.folder, v.uid),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: ["messages"] });
      walkMessageCaches(qc, (m) => (m.uid === v.uid ? null : m));
    },
    onError: () => invalidateMailCaches(qc),
    onSettled: () => invalidateMailCaches(qc),
  });
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SendMessageInput) => mailClient.send(input),
    onSuccess: () => invalidateMailCaches(qc),
  });
}

// ------- contacts -------

export function useContactsInfinite(q?: string) {
  return useInfiniteQuery({
    queryKey: mailKeys.contacts(q),
    initialPageParam: null as string | null,
    queryFn: ({ pageParam }) => mailClient.listContacts({ cursor: pageParam, limit: 50, q }),
    getNextPageParam: (last) => last.nextCursor,
    staleTime: 30_000,
  });
}

export function useUpsertContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { email: string; name?: string; starred?: boolean }) =>
      mailClient.upsertContact(v),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

export function useRemoveContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => mailClient.removeContact(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["contacts"] });
      const caches = qc.getQueriesData<{ pages: Page<Contact>[]; pageParams: unknown[] }>({
        queryKey: ["contacts"],
      });
      for (const [key, data] of caches) {
        if (!data) continue;
        qc.setQueryData(key, {
          ...data,
          pages: data.pages.map((p) => ({ ...p, items: p.items.filter((c) => c.id !== id) })),
        });
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["contacts"] }),
  });
}

// re-export folder type for convenience
export type { FolderSummary };
