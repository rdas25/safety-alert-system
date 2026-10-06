"""
Collision Risk Detection Algorithm
-----------------------------------
Given two moving agents (a pedestrian/cyclist and a vehicle, or any two
devices), this module estimates whether they're on a collision course
and how urgent the risk is.

Core idea: convert lat/lon + heading + speed into a 2D velocity vector,
then compute the time and distance of closest approach assuming both
agents keep moving in a straight line at their current heading/speed.
This is a classic "closest point of approach" (CPA) calculation, used
in maritime and aviation collision-avoidance systems — same math, much
smaller scale.

Everything here is pure Python + math, no external dependencies, so you
can run and test this before touching any mobile/backend code.
"""

import math
from dataclasses import dataclass
from enum import Enum


# ---- Data model -----------------------------------------------------

@dataclass
class AgentState:
    """A snapshot of one device's position and motion."""
    lat: float          # degrees
    lon: float           # degrees
    heading_deg: float   # compass heading, 0 = North, 90 = East
    speed_mps: float     # meters per second


class RiskLevel(Enum):
    NONE = "none"
    LOW = "low"
    MODERATE = "moderate"
    HIGH = "high"


@dataclass
class RiskAssessment:
    risk_level: RiskLevel
    time_to_cpa_s: float     # seconds until closest approach (can be negative = already past)
    distance_at_cpa_m: float  # predicted minimum distance between the two agents


# ---- Geometry helpers -------------------------------------------------

EARTH_RADIUS_M = 6371000.0


def latlon_to_local_xy(lat, lon, ref_lat, ref_lon):
    """
    Convert lat/lon to a local flat-earth XY plane (meters) relative to a
    reference point. Fine for short distances (city-block scale); do NOT
    use this for anything spanning more than a few km.
    """
    ref_lat_rad = math.radians(ref_lat)
    dx = math.radians(lon - ref_lon) * EARTH_RADIUS_M * math.cos(ref_lat_rad)
    dy = math.radians(lat - ref_lat) * EARTH_RADIUS_M
    return dx, dy


def heading_speed_to_velocity(heading_deg, speed_mps):
    """Convert compass heading + speed into an (vx, vy) velocity vector."""
    heading_rad = math.radians(heading_deg)
    vx = speed_mps * math.sin(heading_rad)  # East component
    vy = speed_mps * math.cos(heading_rad)  # North component
    return vx, vy


# ---- Core CPA calculation --------------------------------------------

def compute_cpa(agent_a: AgentState, agent_b: AgentState):
    """
    Compute time-to-closest-approach and the distance at that moment,
    assuming both agents continue in a straight line at current
    heading/speed.
    """
    # Use agent A as the local reference point for flat-earth conversion.
    ax, ay = 0.0, 0.0
    bx, by = latlon_to_local_xy(agent_b.lat, agent_b.lon, agent_a.lat, agent_a.lon)

    avx, avy = heading_speed_to_velocity(agent_a.heading_deg, agent_a.speed_mps)
    bvx, bvy = heading_speed_to_velocity(agent_b.heading_deg, agent_b.speed_mps)

    # Relative position and velocity (B relative to A)
    rx = bx - ax
    ry = by - ay
    rvx = bvx - avx
    rvy = bvy - avy

    rel_speed_sq = rvx ** 2 + rvy ** 2

    if rel_speed_sq < 1e-6:
        # Both agents moving at (nearly) the same velocity -> distance
        # never changes. Time-to-CPA is undefined; treat "now" as the
        # relevant moment.
        current_dist = math.hypot(rx, ry)
        return 0.0, current_dist

    # Time at which relative distance is minimized (calculus: derivative
    # of squared distance w.r.t. time set to zero).
    t_cpa = -(rx * rvx + ry * rvy) / rel_speed_sq

    # Position of B relative to A at t_cpa
    cpa_x = rx + rvx * t_cpa
    cpa_y = ry + rvy * t_cpa
    dist_at_cpa = math.hypot(cpa_x, cpa_y)

    return t_cpa, dist_at_cpa


# ---- Risk classification ----------------------------------------------

# Tune these thresholds during pilot testing (step 6 of the roadmap) —
# these are reasonable starting guesses, not final values.
HIGH_RISK_DISTANCE_M = 3.0
MODERATE_RISK_DISTANCE_M = 8.0
MAX_LOOKAHEAD_S = 15.0  # ignore CPAs predicted too far in the future


def assess_risk(agent_a: AgentState, agent_b: AgentState) -> RiskAssessment:
    t_cpa, dist_at_cpa = compute_cpa(agent_a, agent_b)

    # Already moved past each other, or CPA is too far in the future to
    # be actionable right now.
    if t_cpa < 0 or t_cpa > MAX_LOOKAHEAD_S:
        return RiskAssessment(RiskLevel.NONE, t_cpa, dist_at_cpa)

    if dist_at_cpa <= HIGH_RISK_DISTANCE_M:
        level = RiskLevel.HIGH
    elif dist_at_cpa <= MODERATE_RISK_DISTANCE_M:
        level = RiskLevel.MODERATE
    else:
        level = RiskLevel.NONE

    return RiskAssessment(level, t_cpa, dist_at_cpa)


# ---- Synthetic test cases ---------------------------------------------

def _run_tests():
    print("Test 1: Head-on converging paths (should be HIGH risk)")
    a = AgentState(lat=40.4237, lon=-86.9212, heading_deg=90, speed_mps=1.4)   # walking east
    b = AgentState(lat=40.4237, lon=-86.9200, heading_deg=270, speed_mps=8.0)  # driving west, toward A
    result = assess_risk(a, b)
    print(f"  -> {result}\n")

    print("Test 2: Parallel paths, safe distance apart (should be NONE)")
    a = AgentState(lat=40.4237, lon=-86.9212, heading_deg=0, speed_mps=1.4)
    b = AgentState(lat=40.4240, lon=-86.9212, heading_deg=0, speed_mps=1.4)
    result = assess_risk(a, b)
    print(f"  -> {result}\n")

    print("Test 3: Already-separated paths, moving apart (should be NONE)")
    a = AgentState(lat=40.4237, lon=-86.9212, heading_deg=0, speed_mps=1.4)    # walking north
    b = AgentState(lat=40.4238, lon=-86.9212, heading_deg=0, speed_mps=1.4)    # already ahead, also walking north (never converges)
    result = assess_risk(a, b)
    print(f"  -> {result}\n")

    print("Test 4: Crossing paths at a close distance (should be MODERATE or HIGH)")
    a = AgentState(lat=40.4237, lon=-86.9212, heading_deg=90, speed_mps=1.4)          # walking east
    b = AgentState(lat=40.42396979648177, lon=-86.92111730594948, heading_deg=180, speed_mps=6.0)  # driving south, paths cross ~5s from now
    result = assess_risk(a, b)
    print(f"  -> {result}\n")


if __name__ == "__main__":
    _run_tests()