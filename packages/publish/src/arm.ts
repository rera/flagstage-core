function scheduleName(id: string, action: "publish" | "revert") {
  return `fs-${action}-${id}`.replace(/[^0-9A-Za-z-_]/g, "").slice(0, 64);
}

function configured() {
  const target = process.env.SCHEDULE_TARGET_ARN;
  const role = process.env.SCHEDULE_ROLE_ARN;
  const group = process.env.SCHEDULE_GROUP;
  if (!target || !role || !group) return null;
  return { target, role, group };
}

/** One-time EventBridge schedule. No-op when the stack env is absent (local tick). */
export async function armSchedule(id: string, at: Date, action: "publish" | "revert") {
  const env = configured();
  if (!env) return;
  const { SchedulerClient, CreateScheduleCommand } = await import("@aws-sdk/client-scheduler");
  await new SchedulerClient({}).send(
    new CreateScheduleCommand({
      Name: scheduleName(id, action),
      GroupName: env.group,
      ScheduleExpression: `at(${at.toISOString().slice(0, 19)})`,
      ScheduleExpressionTimezone: "UTC",
      FlexibleTimeWindow: { Mode: "OFF" },
      ActionAfterCompletion: "DELETE",
      Target: {
        Arn: env.target,
        RoleArn: env.role,
        Input: JSON.stringify({ scheduleId: id, action })
      }
    })
  );
}

export async function disarmSchedule(id: string, action: "publish" | "revert") {
  const env = configured();
  if (!env) return;
  const { SchedulerClient, DeleteScheduleCommand } = await import("@aws-sdk/client-scheduler");
  await new SchedulerClient({}).send(
    new DeleteScheduleCommand({ Name: scheduleName(id, action), GroupName: env.group })
  ).catch(() => undefined);
}
