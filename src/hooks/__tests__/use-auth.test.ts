import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAuth } from "@/hooks/use-auth";

vi.mock("next/navigation", () => ({
  useRouter: vi.fn(),
}));

vi.mock("@/actions", () => ({
  signIn: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/lib/anon-work-tracker", () => ({
  getAnonWorkData: vi.fn(),
  clearAnonWork: vi.fn(),
}));

vi.mock("@/actions/get-projects", () => ({
  getProjects: vi.fn(),
}));

vi.mock("@/actions/create-project", () => ({
  createProject: vi.fn(),
}));

import { useRouter } from "next/navigation";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import {
  getAnonWorkData,
  clearAnonWork,
} from "@/lib/anon-work-tracker";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";

const mockedUseRouter = vi.mocked(useRouter);
const mockedSignIn = vi.mocked(signInAction);
const mockedSignUp = vi.mocked(signUpAction);
const mockedGetAnonWorkData = vi.mocked(getAnonWorkData);
const mockedClearAnonWork = vi.mocked(clearAnonWork);
const mockedGetProjects = vi.mocked(getProjects);
const mockedCreateProject = vi.mocked(createProject);

describe("useAuth", () => {
  const push = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockedUseRouter.mockReturnValue({
      push,
      replace: vi.fn(),
      back: vi.fn(),
      forward: vi.fn(),
      refresh: vi.fn(),
      prefetch: vi.fn(),
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initial state", () => {
    test("returns signIn, signUp, and isLoading=false", () => {
      const { result } = renderHook(() => useAuth());

      expect(result.current.isLoading).toBe(false);
      expect(typeof result.current.signIn).toBe("function");
      expect(typeof result.current.signUp).toBe("function");
    });
  });

  describe("signIn", () => {
    test("routes to a new project from anonymous work when messages exist", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "hi" }],
        fileSystemData: { "/App.jsx": { type: "file", content: "x" } },
      });
      mockedCreateProject.mockResolvedValue({ id: "proj-anon" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        const r = await result.current.signIn("a@b.com", "password123");
        expect(r).toEqual({ success: true });
      });

      expect(mockedSignIn).toHaveBeenCalledWith("a@b.com", "password123");
      expect(mockedCreateProject).toHaveBeenCalledTimes(1);
      const arg = mockedCreateProject.mock.calls[0][0];
      expect(arg.messages).toEqual([{ role: "user", content: "hi" }]);
      expect(arg.data).toEqual({
        "/App.jsx": { type: "file", content: "x" },
      });
      expect(arg.name).toMatch(/^Design from /);
      expect(mockedClearAnonWork).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/proj-anon");
      expect(mockedGetProjects).not.toHaveBeenCalled();
    });

    test("routes to most recent project when no anon work but projects exist", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue(null);
      mockedGetProjects.mockResolvedValue([
        { id: "p1", name: "First", createdAt: new Date(), updatedAt: new Date() },
        { id: "p2", name: "Second", createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password123");
      });

      expect(push).toHaveBeenCalledWith("/p1");
      expect(mockedCreateProject).not.toHaveBeenCalled();
      expect(mockedClearAnonWork).not.toHaveBeenCalled();
    });

    test("creates a fresh project when no anon work and no projects exist", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue(null);
      mockedGetProjects.mockResolvedValue([]);
      mockedCreateProject.mockResolvedValue({ id: "fresh" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password123");
      });

      const arg = mockedCreateProject.mock.calls[0][0];
      expect(arg.name).toMatch(/^New Design #\d+$/);
      expect(arg.messages).toEqual([]);
      expect(arg.data).toEqual({});
      expect(push).toHaveBeenCalledWith("/fresh");
    });

    test("falls through to project lookup when anon work has zero messages", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue({
        messages: [],
        fileSystemData: { "/": {} },
      });
      mockedGetProjects.mockResolvedValue([
        { id: "p1", name: "x", createdAt: new Date(), updatedAt: new Date() },
      ] as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signIn("a@b.com", "password123");
      });

      expect(mockedClearAnonWork).not.toHaveBeenCalled();
      expect(push).toHaveBeenCalledWith("/p1");
    });

    test("does not run post-signin flow when sign-in fails", async () => {
      mockedSignIn.mockResolvedValue({
        success: false,
        error: "Invalid credentials",
      });

      const { result } = renderHook(() => useAuth());

      let returned: any;
      await act(async () => {
        returned = await result.current.signIn("a@b.com", "wrong");
      });

      expect(returned).toEqual({ success: false, error: "Invalid credentials" });
      expect(mockedGetAnonWorkData).not.toHaveBeenCalled();
      expect(mockedGetProjects).not.toHaveBeenCalled();
      expect(mockedCreateProject).not.toHaveBeenCalled();
      expect(push).not.toHaveBeenCalled();
    });

    test("toggles isLoading true during the call and false after", async () => {
      let resolveSignIn: (v: any) => void = () => {};
      mockedSignIn.mockReturnValue(
        new Promise((resolve) => {
          resolveSignIn = resolve;
        }) as any
      );

      const { result } = renderHook(() => useAuth());

      let signInPromise: Promise<any>;
      act(() => {
        signInPromise = result.current.signIn("a@b.com", "password123");
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(true);
      });

      await act(async () => {
        resolveSignIn({ success: false });
        await signInPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading even when the action throws", async () => {
      mockedSignIn.mockRejectedValue(new Error("network down"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signIn("a@b.com", "password123");
        })
      ).rejects.toThrow("network down");

      expect(result.current.isLoading).toBe(false);
    });

    test("resets isLoading even when createProject throws during post-signin", async () => {
      mockedSignIn.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue(null);
      mockedGetProjects.mockResolvedValue([]);
      mockedCreateProject.mockRejectedValue(new Error("db error"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signIn("a@b.com", "password123");
        })
      ).rejects.toThrow("db error");

      expect(result.current.isLoading).toBe(false);
    });
  });

  describe("signUp", () => {
    test("routes to a new project from anonymous work when messages exist", async () => {
      mockedSignUp.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue({
        messages: [{ role: "user", content: "hello" }],
        fileSystemData: { "/App.jsx": { type: "file", content: "y" } },
      });
      mockedCreateProject.mockResolvedValue({ id: "signup-anon" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        const r = await result.current.signUp("new@b.com", "password123");
        expect(r).toEqual({ success: true });
      });

      expect(mockedSignUp).toHaveBeenCalledWith("new@b.com", "password123");
      expect(mockedClearAnonWork).toHaveBeenCalledTimes(1);
      expect(push).toHaveBeenCalledWith("/signup-anon");
    });

    test("creates a fresh project when there is no anon work and no projects", async () => {
      mockedSignUp.mockResolvedValue({ success: true });
      mockedGetAnonWorkData.mockReturnValue(null);
      mockedGetProjects.mockResolvedValue([]);
      mockedCreateProject.mockResolvedValue({ id: "first-project" } as any);

      const { result } = renderHook(() => useAuth());

      await act(async () => {
        await result.current.signUp("new@b.com", "password123");
      });

      expect(push).toHaveBeenCalledWith("/first-project");
    });

    test("returns the action result and does not route on failure", async () => {
      mockedSignUp.mockResolvedValue({
        success: false,
        error: "Email already registered",
      });

      const { result } = renderHook(() => useAuth());

      let returned: any;
      await act(async () => {
        returned = await result.current.signUp("dup@b.com", "password123");
      });

      expect(returned).toEqual({
        success: false,
        error: "Email already registered",
      });
      expect(push).not.toHaveBeenCalled();
      expect(mockedGetAnonWorkData).not.toHaveBeenCalled();
    });

    test("resets isLoading when the action throws", async () => {
      mockedSignUp.mockRejectedValue(new Error("boom"));

      const { result } = renderHook(() => useAuth());

      await expect(
        act(async () => {
          await result.current.signUp("a@b.com", "password123");
        })
      ).rejects.toThrow("boom");

      expect(result.current.isLoading).toBe(false);
    });
  });
});
