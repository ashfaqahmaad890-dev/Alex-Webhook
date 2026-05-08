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

async function logToSheets(data) {
  if (!process.env.GOOGLE_SHEETS_URL) return;
  try {
    await axios.post(process.env.GOOGLE_SHEETS_URL, data);
  } catch (e) {
    console.error('[SHEETS ERROR]', e.message);
  }
}

async function logPropertyEnquiry(p) {
  await logToSheets({
    caller_name: p.caller_name,
    caller_phone: p.caller_phone,
    caller_email: p.caller_email || 'Not provided',
    property_address: p.property_address || 'Not specified',
    enquiry_type: p.enquiry_type,
    outcome: 'Enquiry logged',
    follow_up_required: true
  });
  return { success: true };
}

async function scheduleInspection(p) {
  await logToSheets({
    caller_name: p.caller_name,
    caller_phone: p.caller_phone,
    caller_email: p.caller_email || 'Not provided',
    property_address: p.property_address,
    enquiry_type: 'Inspection - ' + p.inspection_type,
    outcome: `Inspection requested for ${p.preferred_date} at ${p.preferred_time}`,
    follow_up_required: true
  });
  return { success: true };
}

async function requestAgentCallback(p) {
  await logToSheets({
    caller_name: p.caller_name,
    caller_phone: p.caller_phone,
    caller_email: 'Not provided',
    property_address: 'N/A',
    enquiry_type: 'Agent Callback',
    outcome: `Callback requested — Reason: ${p.reason}`,
    follow_up_required: true
  });
  return { success: true };
}

async function logCallRecord(p) {
  await logToSheets({
    caller_name: p.caller_name || 'Unknown',
    caller_phone: p.caller_phone || 'Not provided',
    caller_email: 'Not provided',
    property_address: 'N/A',
    enquiry_type: p.call_type,
    outcome: p.outcome,
    follow_up_required: p.follow_up_required
  });
  return { success: true };
}

async function handleEndOfCall(message) {
  const { structuredData } = message;
  console.log('[END OF CALL] Outcome:', structuredData?.call_outcome);
}

app.listen(process.env.PORT || 3000, () => {
  console.log(`Cara webhook server running on port ${process.env.PORT || 3000}`);
});
