from pydantic import BaseModel, Field, field_validator
from typing import List, Literal, Optional
from datetime import datetime

# ===== User Models =====

class UserBase(BaseModel):
    id: str
    name: str
    email: str
    role: str
    teamId: str
    deptId: str
    reliabilityScore: float
    skills: List[str] = []

class UserCreate(BaseModel):
    name: str
    email: str
    password: str = Field(min_length=12, max_length=256)
    role: str = "ASSIGNEE"
    skills: List[str] = []

class UserLogin(BaseModel):
    email: str
    password: str

class UserUpdate(BaseModel):
    name: Optional[str] = None
    reliabilityScore: Optional[float] = None
    skills: Optional[List[str]] = None
    teamId: Optional[str] = None
    deptId: Optional[str] = None

class UserPublic(UserBase):
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    @field_validator("role", mode="before")
    @classmethod
    def normalize_legacy_role(cls, value: str) -> str:
        return "TEAM_LEAD" if value == "LEAD" else value


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic

# ===== Project Models =====

class ProjectBase(BaseModel):
    id: str
    name: str
    description: str
    orgId: str
    status: str = "ACTIVE"

class ProjectCreate(BaseModel):
    name: str
    description: str
    orgId: str = "ORG-001"

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    leadId: Optional[str] = None

class Project(ProjectBase):
    leadId: Optional[str] = None
    memberIds: List[str] = []
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)

    class Config:
        json_schema_extra = {
            "example": {
                "id": "PROJ-001",
                "name": "Mobile App Development",
                "description": "iOS and Android apps",
                "orgId": "ORG-001",
                "leadId": "USER-002",
                "memberIds": ["USER-001", "USER-003"],
                "status": "ACTIVE"
            }
        }

# ===== Task Models =====

class TaskBase(BaseModel):
    id: str
    title: str
    description: str
    status: str
    priority: str
    assigneeId: str
    teamId: str
    deptId: str
    orgId: str

class TaskCreate(BaseModel):
    title: str
    description: str
    priority: str = "MEDIUM"
    deadline: int  # timestamp in milliseconds
    startDate: Optional[int] = None # timestamp
    estimatedDuration: Optional[int] = None # minutes
    dependencies: List[str] = []
    teamId: str
    deptId: str
    orgId: str = "ORG-001"
    projectId: Optional[str] = None
    requiredSkills: Optional[List[str]] = None
    assigneeId: Optional[str] = None  # Optional for auto-assignment

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    startDate: Optional[int] = None
    estimatedDuration: Optional[int] = None
    dependencies: Optional[List[str]] = None
    actualStartDate: Optional[int] = None
    assigneeId: Optional[str] = None
    riskScore: Optional[int] = None
    lastAction: Optional[str] = None

class TaskAgentStateUpdate(BaseModel):
    riskScore: int = Field(ge=0, le=100)
    lastAction: Literal[
        "NONE", "REMIND", "RISK_ALERT", "ESCALATE", "CRITICAL_ESCALATE"
    ]

class TraceMemory(BaseModel):
    id: str
    text: str
    score: Optional[float] = None


class DecisionTraceCreate(BaseModel):
    decisionId: str = Field(min_length=1, max_length=100)
    riskScore: int = Field(ge=0, le=100)
    action: Literal["REMIND", "RISK_ALERT", "ESCALATE", "CRITICAL_ESCALATE"]
    retrievedMemories: List[TraceMemory] = Field(default_factory=list)
    retrievalSource: Literal["FAISS", "LOCAL_FALLBACK", "NONE"]
    explanation: str
    explanationSource: Literal["GEMINI", "UNAVAILABLE"]
    escalationPath: List[str] = Field(default_factory=list)


class ExecutionMemoryUpdate(BaseModel):
    memoryId: Optional[str] = None
    stored: bool


class Task(TaskBase):
    deadline: int
    startDate: Optional[int] = None
    estimatedDuration: Optional[int] = None
    dependencies: List[str] = []
    actualStartDate: Optional[int] = None
    projectId: Optional[str] = None
    requiredSkills: Optional[List[str]] = None
    riskScore: int = 0
    lastAction: str = "NONE"
    createdAt: datetime = Field(default_factory=datetime.utcnow)
    updatedAt: datetime = Field(default_factory=datetime.utcnow)
    
    # Performance tracking fields
    completedAt: Optional[int] = None  # timestamp when completed
    completionQuality: Optional[float] = None  # 0-1 quality rating
    wasOnTime: Optional[bool] = None  # completed before deadline
    estimatedHours: Optional[float] = None  # estimated time to complete
    actualHours: Optional[float] = None  # actual time spent

    class Config:
        json_schema_extra = {
            "example": {
                "id": "TASK-001",
                "title": "Implement Authentication",
                "description": "Add user login functionality",
                "status": "CREATED",
                "priority": "HIGH",
                "deadline": 1738229400000,
                "assigneeId": "USER-001",
                "teamId": "TEAM-001",
                "deptId": "DEPT-001",
                "orgId": "ORG-001",
                "projectId": "PROJ-001",
                "requiredSkills": ["JavaScript", "React"],
                "riskScore": 0,
                "lastAction": "NONE"
            }
        }

# ===== Performance Tracking Models =====

class PerformanceHistory(BaseModel):
    id: str
    userId: str
    taskId: str
    completedAt: int  # timestamp
    wasOnTime: bool
    quality: float  # 0-1 scale
    skillsUsed: List[str]
    hoursSpent: Optional[float] = None
    taskPriority: str
    
    class Config:
        json_schema_extra = {
            "example": {
                "id": "PERF-001",
                "userId": "USER-001",
                "taskId": "TASK-001",
                "completedAt": 1738229400000,
                "wasOnTime": True,
                "quality": 0.9,
                "skillsUsed": ["JavaScript", "React"],
                "hoursSpent": 4.5,
                "taskPriority": "HIGH"
            }
        }

class TaskComplete(BaseModel):
    quality: Optional[float] = Field(None, ge=0.0, le=1.0, description="Quality rating from 0 to 1")
    hoursSpent: Optional[float] = Field(None, ge=0, description="Hours spent on task")

# ===== Response Models =====

class MessageResponse(BaseModel):
    message: str
    data: Optional[dict] = None
