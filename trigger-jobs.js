// Node script to trigger sample job submissions to the running Docker services
// Uses native fetch (Node 18+)

const API_URL = 'http://localhost:3000';

async function trigger() {
  console.log('Connecting to API...');
  
  // 1. Log in as admin
  const loginRes = await fetch(`${API_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@example.com', password: 'admin123' })
  });

  if (!loginRes.ok) {
    throw new Error('Authentication failed');
  }

  const loginData = await loginRes.json();
  const token = loginData.accessToken;
  console.log('Logged in successfully!');

  // 2. Fetch Projects
  const orgId = loginData.organization.id;
  const projectRes = await fetch(`${API_URL}/projects?orgId=${orgId}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const projects = await projectRes.json();
  const project = projects[0];
  console.log(`Active Project: ${project.name} (${project.id})`);

  // 3. Fetch Queues
  const queuesRes = await fetch(`${API_URL}/queues?projectId=${project.id}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const queues = await queuesRes.json();
  
  const emailQueue = queues.find(q => q.name === 'email-dispatch-queue');
  const imageQueue = queues.find(q => q.name === 'image-processing-queue');

  if (!emailQueue || !imageQueue) {
    throw new Error('Required queues not found');
  }

  console.log(`Email Queue: ${emailQueue.id}`);
  console.log(`Image Queue: ${imageQueue.id}`);

  // 4. Submit 5 immediate send-email jobs
  console.log('Submitting 5 immediate email jobs...');
  for (let i = 1; i <= 5; i++) {
    await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        queueId: emailQueue.id,
        type: 'send-email',
        payload: { to: `customer_${i}@gmail.com`, subject: `Order Confirmation #${1000 + i}`, body: 'Thank you for your business!' }
      })
    });
  }

  // 5. Submit 3 delayed process-image jobs
  console.log('Submitting 3 delayed image jobs...');
  for (let i = 1; i <= 3; i++) {
    await fetch(`${API_URL}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        queueId: imageQueue.id,
        type: 'process-image',
        payload: { imageUrl: `https://cdn.acme.com/assets/img_${i}.jpg`, format: 'webp', width: 640, height: 480 },
        delayMs: i * 5000 // 5s, 10s, 15s delays
      })
    });
  }

  // 6. Submit a batch of 8 jobs
  console.log('Submitting a batch of 8 jobs...');
  const batchJobs = Array.from({ length: 8 }).map((_, idx) => ({
    type: 'send-email',
    payload: { to: `newsletter_recipient_${idx}@acme.com`, subject: 'Monthly Newsletter', body: 'Read the latest updates.' }
  }));

  const batchRes = await fetch(`${API_URL}/jobs/batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({
      queueId: emailQueue.id,
      jobs: batchJobs
    })
  });
  const batchData = await batchRes.json();
  console.log(`Submitted batch with ID: ${batchData.batchId}`);

  console.log('All jobs triggered successfully! Watch the dashboard light up.');
}

trigger().catch(console.error);
