/**
 * Supabase sync for the device agent: device registration, heartbeat, and
 * voice-command logging. RLS does the real authorization — this client only
 * carries the user's access token; transcripts are stored solely when the
 * user consented (plan sections 5.4 and 9).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { VoiceCommandRecord } from "@maya/core";

export interface DeviceAgentConfig {
  supabaseUrl: string;
  /** Publishable key only. The secret key never enters the device agent. */
  publishableKey: string;
  /** Supabase access token obtained by the CLI sign-in. */
  accessToken: string;
  deviceName: string;
}

export interface RegisteredDevice {
  id: string;
  name: string;
  platform: string;
}

export type DevicePlatformDb = "windows" | "macos" | "android" | "ios" | "web";

export function toDbPlatform(platform: string): DevicePlatformDb {
  switch (platform) {
    case "macos":
      return "macos";
    case "windows":
      return "windows";
    case "android":
      return "android";
    case "ios":
      return "ios";
    default:
      return "web";
  }
}

export function createSyncClient(config: DeviceAgentConfig): SupabaseClient {
  return createClient(config.supabaseUrl, config.publishableKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${config.accessToken}` } },
  });
}

export interface DeviceSyncDeps {
  client: SupabaseClient | null;
  config: DeviceAgentConfig;
}

export class DeviceSync {
  private deviceId: string | null = null;

  constructor(private readonly deps: DeviceSyncDeps) {}

  get id(): string | null {
    return this.deviceId;
  }

  /** Insert-or-update this machine in `devices` (RLS binds it to the user). */
  async registerDevice(platformDb: DevicePlatformDb, appVersion: string): Promise<RegisteredDevice | null> {
    const { client, config } = this.deps;
    if (!client) return null;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return null;

    const { data: existing } = await client
      .from("devices")
      .select("id, name, platform")
      .eq("user_id", user.id)
      .eq("name", config.deviceName)
      .maybeSingle();

    if (existing) {
      await client.from("devices").update({ last_seen_at: new Date().toISOString(), app_version: appVersion }).eq("id", existing.id);
      this.deviceId = existing.id as string;
      return existing as RegisteredDevice;
    }

    const { data, error } = await client
      .from("devices")
      .insert({ user_id: user.id, name: config.deviceName, platform: platformDb, app_version: appVersion, is_trusted: false })
      .select("id, name, platform")
      .single();
    if (error || !data) return null;
    this.deviceId = data.id as string;
    return data as RegisteredDevice;
  }

  /** One row per handled utterance; transcript only with explicit consent. */
  async logCommand(record: VoiceCommandRecord, transcript?: string): Promise<void> {
    const { client, config } = this.deps;
    if (!client) return;
    const { data: { user } } = await client.auth.getUser();
    if (!user) return;
    await client.from("voice_commands").insert({
      user_id: user.id,
      device_id: this.deviceId,
      channel: record.channel,
      intent: record.intent,
      risk: record.risk,
      status: record.status,
      latency_ms: record.latencyMs,
      error: record.error ?? null,
      transcript: record.transcript ? (transcript ?? null) : null,
    });
  }
}
