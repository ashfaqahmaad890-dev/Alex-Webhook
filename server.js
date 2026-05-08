require('dotenv').config();
const express = require('express');
const axios = require('axios');
const app = express();
app.use(express.json());

app.post('/vapi/webhook', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'No message' });

  switch (message.type) {
    case 'tool-calls':
      return handleToolCalls(message, res);
    case 'end-of-call-report':
      await handleEndOfCall(message);
      return res.json({ received: true });
    default:
      return res.json({ received: true });
  }
});

async function handleToolCalls(message, res) {
  const results = [];
  for (const toolCall of message.toolCallList || []) {
    const { id, name, parameters } = toolCall;
    let result;
    try {
      switch (name) {
        case 'logPropertyEnquiry':
          result = await logPropertyEnquiry(parameters);
          break;
        case 'scheduleInspection':
          result = await scheduleInspection(parameters);
          break;
        case 'requestAgentCallback':
          result = await requestAgentCallback(parameters);
          break;
        case 'logCallRecord':
          result = await logCallRecord(parameters);
          break;
        default:
          result = { error: `Unknown tool: ${name}` };
      }
    } catch (err) {
      result = { error: 'Tool failed', details: err.message };
    }
    results.push({ toolCallId: id, result: JSON.stringify(result) });
  }
  return res.json({ results });
}

async function logPropertyEnquiry(p) {
  await notifySlack(
    `🏠 *New Property Enquiry*\n` +
    `Name: ${p.caller_name}\n` +
    `Phone: ${p.caller_phone}\n` +
    `Email: ${p.caller_email || 'Not provided'}\n` +
    `Property: ${p.property_address || 'Not specified'}\n` +
    `Type: ${p.enquiry_type}\n` +
    `Notes: ${p.notes || 'None'}`
  );
  return { success: true };
}

async function scheduleInspection(p) {
  await notifySlack(
    `📅 *Inspection Request*\n` +
    `Name: ${p.caller_name}\n` +
    `Phone: ${p.caller_phone}\n` +
    `Property: ${p.property_address}\n` +
    `Type: ${p.inspection_type}\n` +
    `Date: ${p.preferred_date} at ${p.preferred_time}\n` +
    `Special needs: ${p.special_requirements || 'None'}`
  );
  return { success: true };
}

async function requestAgentCallback(p) {
  const urgencyEmoji = p.urgency === 'urgent' ? '🚨' : '📞';
  await notifySlack(
    `${urgencyEmoji} *Agent Callback Request*\n` +
    `Name: ${p.caller_name}\n` +
    `Phone: ${p.caller_phone}\n` +
    `Best time: ${p.best_time_to_call || 'Any time'}\n` +
    `Agent: ${p.agent_name || 'Any available'}\n` +
    `Reason: ${p.reason}`
  );
  return { success: true };
}

async function logCallRecord(p) {
  await notifySlack(
    `📋 *Call Log*\n` +
    `Type: ${p.call_type}\n` +
    `Caller: ${p.caller_name || 'Unknown'} — ${p.caller_phone || 'No number'}\n` +
    `Reason: ${p.call_reason}\n` +
    `Outcome: ${p.outcome}\n` +
    `Follow up needed: ${p.follow_up_required ? 'YES' : 'No'}\n` +
    `Notes: ${p.follow_up_notes || 'None'}`
  );
  return { success: true };
}

async function handleEndOfCall(message) {
  const { structuredData, call } = message;
  console.log('[END OF CALL] Outcome:', structuredData?.call_outcome);
}

async function notifySlack(text) {
  if (!process.env.SLACK_WEBHOOK_URL) return;
  try {
    await axios.post(process.env.SLACK_WEBHOOK_URL, { text });
  } catch (e) {
    console.error('[SLACK ERROR]', e.message);
  }
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Cara webhook server running on port ${process.env.PORT || 3000}`);
});
