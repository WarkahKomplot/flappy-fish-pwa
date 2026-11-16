import type { FishEntity } from '../types';

/**
 * Draws the default 'neon-tetra' bioluminescent reef skin.
 * Features a glowing cyan/blue torpedo-like silhouette, electric lateral stripe,
 * dorsal and tail fins, and a luminous eye.
 */
export function drawNeonTetra(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number
): void {
  const tailSway = Math.sin(time * 12) * (radius * 0.15);

  ctx.save();

  // Subtle outer glow
  ctx.shadowColor = '#00f0ff';
  ctx.shadowBlur = 8;

  // Caudal (tail) fin
  ctx.beginPath();
  ctx.moveTo(-radius * 0.9, 0);
  ctx.lineTo(-radius * 1.8, -radius * 0.7 + tailSway);
  ctx.quadraticCurveTo(-radius * 1.4, 0, -radius * 1.8, radius * 0.7 + tailSway);
  ctx.closePath();
  ctx.fillStyle = '#0066ff';
  ctx.fill();

  // Dorsal fin (top)
  ctx.beginPath();
  ctx.moveTo(-radius * 0.4, -radius * 0.6);
  ctx.lineTo(-radius * 0.8, -radius * 1.2);
  ctx.lineTo(radius * 0.1, -radius * 0.55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 240, 255, 0.8)';
  ctx.fill();

  // Ventral fin (bottom)
  ctx.beginPath();
  ctx.moveTo(-radius * 0.2, radius * 0.6);
  ctx.lineTo(-radius * 0.5, radius * 1.0);
  ctx.lineTo(radius * 0.2, radius * 0.55);
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 102, 255, 0.7)';
  ctx.fill();

  // Body gradient (electric cyan to royal deep blue)
  const bodyGrad = ctx.createLinearGradient(-radius * 1.2, 0, radius * 1.2, 0);
  bodyGrad.addColorStop(0, '#0066ff');
  bodyGrad.addColorStop(0.4, '#00d4ff');
  bodyGrad.addColorStop(1, '#00f0ff');

  ctx.beginPath();
  // Nose at (radius * 1.2, 0)
  ctx.moveTo(radius * 1.2, 0);
  // Top curve back to tail
  ctx.bezierCurveTo(
    radius * 0.6, -radius * 0.85,
    -radius * 0.4, -radius * 0.75,
    -radius * 1.0, 0
  );
  // Bottom curve forward to nose
  ctx.bezierCurveTo(
    -radius * 0.4, radius * 0.75,
    radius * 0.6, radius * 0.85,
    radius * 1.2, 0
  );
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();

  // Luminous electric cyan lateral stripe
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(-radius * 0.8, -radius * 0.05);
  ctx.lineTo(radius * 0.7, -radius * 0.05);
  ctx.strokeStyle = '#e0faff';
  ctx.lineWidth = Math.max(1.5, radius * 0.12);
  ctx.stroke();

  // Reset shadow for crisp eye details
  ctx.shadowBlur = 0;

  // Eye socket & iris
  const eyeX = radius * 0.55;
  const eyeY = -radius * 0.18;
  const eyeRadius = radius * 0.26;

  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Pupil
  ctx.beginPath();
  ctx.arc(eyeX + radius * 0.05, eyeY, eyeRadius * 0.6, 0, Math.PI * 2);
  ctx.fillStyle = '#020617';
  ctx.fill();

  // Specular reflection highlight
  ctx.beginPath();
  ctx.arc(eyeX + radius * 0.02, eyeY - radius * 0.08, eyeRadius * 0.22, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

/**
 * Draws the 'clownfish' skin.
 * Features a warm orange body with bold vertical white stripes edged in black,
 * rounded dorsal and caudal fins, and a bright friendly eye.
 */
export function drawClownfish(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number
): void {
  const tailSway = Math.sin(time * 10) * (radius * 0.12);

  ctx.save();

  // Caudal tail fin
  ctx.beginPath();
  ctx.moveTo(-radius * 0.8, 0);
  ctx.lineTo(-radius * 1.5, -radius * 0.65 + tailSway);
  ctx.quadraticCurveTo(-radius * 1.3, tailSway, -radius * 1.5, radius * 0.65 + tailSway);
  ctx.closePath();
  ctx.fillStyle = '#ff7700';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Dorsal fin (rounded with black border)
  ctx.beginPath();
  ctx.moveTo(-radius * 0.3, -radius * 0.7);
  ctx.quadraticCurveTo(-radius * 0.6, -radius * 1.3, 0.1 * radius, -radius * 0.65);
  ctx.fillStyle = '#ff7700';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Ventral fin
  ctx.beginPath();
  ctx.moveTo(-radius * 0.1, radius * 0.7);
  ctx.quadraticCurveTo(-radius * 0.4, radius * 1.2, 0.2 * radius, radius * 0.65);
  ctx.fillStyle = '#ff7700';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Rounded chubby body
  const bodyGrad = ctx.createLinearGradient(0, -radius, 0, radius);
  bodyGrad.addColorStop(0, '#ff8a1e');
  bodyGrad.addColorStop(0.5, '#ff6a00');
  bodyGrad.addColorStop(1, '#ea580c');

  ctx.beginPath();
  ctx.moveTo(radius * 1.15, 0);
  ctx.bezierCurveTo(
    radius * 0.5, -radius * 0.95,
    -radius * 0.5, -radius * 0.85,
    -radius * 0.95, 0
  );
  ctx.bezierCurveTo(
    -radius * 0.5, radius * 0.85,
    radius * 0.5, radius * 0.95,
    radius * 1.15, 0
  );
  ctx.closePath();
  ctx.fillStyle = bodyGrad;
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3 Iconic White Stripes with subtle dark edges
  const drawStripe = (cx: number, width: number, curve: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx - width / 2, -radius * 0.75);
    ctx.quadraticCurveTo(cx + curve, 0, cx - width / 2, radius * 0.75);
    ctx.lineTo(cx + width / 2, radius * 0.75);
    ctx.quadraticCurveTo(cx + curve + width, 0, cx + width / 2, -radius * 0.75);
    ctx.closePath();
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  };

  // 1. Head stripe behind eye
  drawStripe(radius * 0.25, radius * 0.22, radius * 0.08);
  // 2. Mid-body curved stripe
  drawStripe(-radius * 0.22, radius * 0.25, radius * 0.06);
  // 3. Tail-peduncle stripe
  drawStripe(-radius * 0.72, radius * 0.16, 0);

  // Eye
  const eyeX = radius * 0.65;
  const eyeY = -radius * 0.18;
  const eyeR = radius * 0.28;

  ctx.beginPath();
  ctx.arc(eyeX, eyeY, eyeR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Pupil
  ctx.beginPath();
  ctx.arc(eyeX + radius * 0.04, eyeY, eyeR * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  // Highlight
  ctx.beginPath();
  ctx.arc(eyeX + radius * 0.02, eyeY - radius * 0.08, eyeR * 0.25, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  ctx.restore();
}

/**
 * Draws the 'golden-manta' mythical ray skin.
 * Features a diamond ray physique with undulating pectoral wings,
 * elegant golden shimmer, radiating dorsal chevron, and long whip tail.
 */
export function drawGoldenManta(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number
): void {
  const wingFlap = Math.sin(time * 8) * (radius * 0.35);
  const tailHarmonic = Math.sin(time * 10) * (radius * 0.15);

  ctx.save();

  // Solar golden shimmer glow
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 10;

  // Slender whip tail extending behind
  ctx.beginPath();
  ctx.moveTo(-radius * 0.8, 0);
  ctx.quadraticCurveTo(
    -radius * 1.5, tailHarmonic,
    -radius * 2.3, tailHarmonic * 1.8
  );
  ctx.strokeStyle = '#eab308';
  ctx.lineWidth = Math.max(1.5, radius * 0.1);
  ctx.stroke();

  // Pectoral wings & diamond ray body
  const goldGrad = ctx.createRadialGradient(
    radius * 0.2, 0, radius * 0.1,
    0, 0, radius * 1.4
  );
  goldGrad.addColorStop(0, '#fff2a0');
  goldGrad.addColorStop(0.4, '#ffd700');
  goldGrad.addColorStop(0.85, '#eab308');
  goldGrad.addColorStop(1, '#ca8a04');

  ctx.beginPath();
  // Rostrum (snout tip)
  ctx.moveTo(radius * 1.3, 0);
  // Upper wing sweep
  ctx.bezierCurveTo(
    radius * 0.7, -radius * 0.6,
    radius * 0.1, -radius * 1.3 + wingFlap,
    -radius * 0.3, -radius * 1.4 + wingFlap
  );
  // Upper wing back to tail base
  ctx.bezierCurveTo(
    -radius * 0.4, -radius * 0.7 + wingFlap * 0.5,
    -radius * 0.6, -radius * 0.2,
    -radius * 0.9, 0
  );
  // Lower wing sweep to wingtip
  ctx.bezierCurveTo(
    -radius * 0.6, radius * 0.2,
    -radius * 0.4, radius * 0.7 - wingFlap * 0.5,
    -radius * 0.3, radius * 1.4 - wingFlap
  );
  // Lower wing forward to snout
  ctx.bezierCurveTo(
    radius * 0.1, radius * 1.3 - wingFlap,
    radius * 0.7, radius * 0.6,
    radius * 1.3, 0
  );
  ctx.closePath();
  ctx.fillStyle = goldGrad;
  ctx.fill();
  ctx.strokeStyle = '#fef08a';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  // Dorsal glowing chevron patterns
  ctx.shadowBlur = 6;
  ctx.beginPath();
  ctx.moveTo(radius * 0.4, 0);
  ctx.lineTo(radius * 0.1, -radius * 0.4);
  ctx.moveTo(radius * 0.4, 0);
  ctx.lineTo(radius * 0.1, radius * 0.4);

  ctx.moveTo(radius * 0.05, 0);
  ctx.lineTo(-radius * 0.25, -radius * 0.35);
  ctx.moveTo(radius * 0.05, 0);
  ctx.lineTo(-radius * 0.25, radius * 0.35);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Reset shadow for eyes
  ctx.shadowBlur = 0;

  // Bilateral amber eyes on rostrum
  const drawMantaEye = (ey: number) => {
    ctx.beginPath();
    ctx.arc(radius * 0.85, ey, radius * 0.14, 0, Math.PI * 2);
    ctx.fillStyle = '#0f172a';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(radius * 0.87, ey - 0.5, radius * 0.05, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  };
  drawMantaEye(-radius * 0.25);
  drawMantaEye(radius * 0.25);

  ctx.restore();
}

/**
 * Draws the Forcefield Bubble Shield orb.
 * Translucent cyan/teal pulsing sphere with specular highlight and orbital motes.
 */
export function drawBubbleShield(
  ctx: CanvasRenderingContext2D,
  radius: number,
  time: number
): void {
  const pulse = Math.sin(time * 5) * 0.06;
  const shieldRadius = radius * (1.6 + pulse);

  ctx.save();

  // Soft spherical gradient fill
  const shieldGrad = ctx.createRadialGradient(
    -shieldRadius * 0.3, -shieldRadius * 0.3, shieldRadius * 0.1,
    0, 0, shieldRadius
  );
  shieldGrad.addColorStop(0, 'rgba(224, 250, 255, 0.5)');
  shieldGrad.addColorStop(0.35, 'rgba(34, 211, 238, 0.25)');
  shieldGrad.addColorStop(0.8, 'rgba(6, 182, 212, 0.35)');
  shieldGrad.addColorStop(1, 'rgba(56, 189, 248, 0.75)');

  ctx.beginPath();
  ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
  ctx.fillStyle = shieldGrad;
  ctx.fill();

  // Outer glowing shield rim
  ctx.strokeStyle = 'rgba(125, 211, 252, 0.9)';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#38bdf8';
  ctx.shadowBlur = 10;
  ctx.stroke();

  // Specular reflection glint (top-left arc)
  ctx.shadowBlur = 0;
  ctx.beginPath();
  ctx.arc(
    0, 0,
    shieldRadius * 0.82,
    -Math.PI * 0.8, -Math.PI * 0.3
  );
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
  ctx.lineWidth = Math.max(1.8, shieldRadius * 0.08);
  ctx.lineCap = 'round';
  ctx.stroke();

  // 3 Orbital motes circling the bubble
  for (let i = 0; i < 3; i++) {
    const angle = time * 2.5 + (i * Math.PI * 2) / 3;
    const mx = Math.cos(angle) * (shieldRadius + 4);
    const my = Math.sin(angle) * (shieldRadius + 4);

    ctx.beginPath();
    ctx.arc(mx, my, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 6;
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Master fish renderer dispatching to the active skin vector function,
 * handling pitch rotation, invulnerability 10Hz blinking, and Bubble Shield.
 */
export function renderFish(
  ctx: CanvasRenderingContext2D,
  fish: FishEntity,
  hasShield: boolean,
  time: number = 0
): void {
  ctx.save();

  // Translate to fish world position
  ctx.translate(fish.x, fish.y);

  // 10Hz Invulnerability blinking during grace period
  if (fish.invulnerableTime > 0) {
    const blinkCycle = Math.floor(fish.invulnerableTime * 20) % 2 === 0;
    ctx.globalAlpha = blinkCycle ? 0.35 : 0.9;
  }

  // Rotate based on swimming pitch angle
  ctx.rotate(fish.rotation);

  // Draw active skin
  switch (fish.skin) {
    case 'clownfish':
      drawClownfish(ctx, fish.radius, time);
      break;
    case 'golden-manta':
      drawGoldenManta(ctx, fish.radius, time);
      break;
    case 'neon-tetra':
    default:
      drawNeonTetra(ctx, fish.radius, time);
      break;
  }

  // Draw Bubble Shield if active
  if (hasShield) {
    // Counter-rotate shield so orbital motes and specular highlight maintain global orientation
    ctx.rotate(-fish.rotation);
    drawBubbleShield(ctx, fish.radius, time);
  }

  ctx.restore();
}
